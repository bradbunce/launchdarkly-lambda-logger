const { test } = require('node:test');
const assert = require('node:assert');
const { Logger, LogLevel } = require('../src/index.js');
const winston = require('winston');

// Mock Winston logger
const mockWinstonLogger = {
  log: () => {},
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {}
};

// Store original Winston createLogger
const originalCreateLogger = winston.createLogger;

// Replace createLogger with mock
winston.createLogger = () => mockWinstonLogger;

test('Log levels are correctly ordered', async (t) => {
  assert.equal(LogLevel.FATAL, 0);
  assert.equal(LogLevel.ERROR, 1);
  assert.equal(LogLevel.WARN, 2);
  assert.equal(LogLevel.INFO, 3);
  assert.equal(LogLevel.DEBUG, 4);
  assert.equal(LogLevel.TRACE, 5);
});

test('shouldLog respects log levels', async (t) => {
  const logger = new Logger();
  
  logger.ldClient = {
    variation: async () => LogLevel.INFO
  };
  
  assert.equal(await logger.shouldLog(LogLevel.ERROR), true);
  assert.equal(await logger.shouldLog(LogLevel.DEBUG), false);
});

test('Logger handles missing LD client', async (t) => {
  const logger = new Logger();
  const currentLevel = await logger.getCurrentLogLevel();
  assert.equal(currentLevel, LogLevel.ERROR);
});

test('Logger methods exist', async (t) => {
  const logger = new Logger();
  const methods = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];
  methods.forEach(method => {
    assert.equal(typeof logger[method], 'function');
  });
});

test('formatMessage handles different argument types', async (t) => {
  const logger = new Logger();
  
  // Test string formatting
  assert.equal(logger.formatMessage(['test message']), 'test message');
  
  // Test multiple arguments
  assert.equal(logger.formatMessage(['test', 123]), 'test 123');
  
  // Test object formatting
  const obj = { key: 'value' };
  assert.equal(logger.formatMessage([obj]), JSON.stringify(obj, null, 2));
  
  // Test mixed arguments
  assert.equal(
    logger.formatMessage(['Message:', obj]), 
    `Message: ${JSON.stringify(obj, null, 2)}`
  );
});

test('Logger uses Winston for output', async (t) => {
  const logger = new Logger();
  let loggedMessage;
  
  // Override mock logger method to capture output
  mockWinstonLogger.info = (msg) => {
    loggedMessage = msg;
  };
  
  // Set up logger to allow all levels
  logger.ldClient = {
    variation: async () => LogLevel.INFO
  };
  
  // Test logging
  await logger.info('test message');
  assert.equal(loggedMessage, 'test message');
  
  // Restore original Winston
  winston.createLogger = originalCreateLogger;
});
