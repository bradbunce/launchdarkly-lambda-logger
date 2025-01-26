import { test } from 'node:test';
import assert from 'node:assert';
import { Logger, LogLevel } from '../src/index.js';

test('Logger initialization', async (t) => {
  const logger = new Logger();
  assert.equal(logger.FLAG_KEY, 'lambda-console-logging');
});

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
  
  // Mock LD client
  logger.ldClient = {
    variation: async () => LogLevel.INFO
  };
  
  assert.equal(await logger.shouldLog(LogLevel.ERROR), true);  // ERROR < INFO
  assert.equal(await logger.shouldLog(LogLevel.DEBUG), false); // DEBUG > INFO
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