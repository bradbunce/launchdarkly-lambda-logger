const { test } = require('node:test');
const assert = require('node:assert');
const { Logger, LogLevel } = require('../src/index.js');
const winston = require('winston');

// Create a mock Winston logger factory
const createMockWinstonLogger = (debugCallback) => ({
  log: (level, msg) => {
    if (level === 'debug') debugCallback(msg);
  },
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: (msg) => debugCallback(msg)
});

// Store original Winston createLogger
const originalCreateLogger = winston.createLogger;

// Store original LaunchDarkly module
const LaunchDarkly = require('@launchdarkly/node-server-sdk');
const originalInit = LaunchDarkly.init;
const originalBasicLogger = LaunchDarkly.basicLogger;

// Create a proper mock logger for LaunchDarkly SDK
const createMockLogger = () => ({
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
  log: () => {}
});

// Mock the entire LaunchDarkly module
const mockLDClient = {
  waitForInitialization: async () => mockLDClient,
  variation: async () => LogLevel.INFO,
  close: async () => {},
  initialized: true,
  on: () => mockLDClient,
  off: () => mockLDClient,
  _streaming: false,
  _eventsProcessor: null,
  _dataSourceUpdates: { version: 1 }
};

// Mock the LaunchDarkly module's init function
LaunchDarkly.init = (sdkKey, options = {}) => {
  // Force offline mode and prevent streaming
  const config = {
    offline: true,
    streaming: false,
    sendEvents: false,
    useLdd: true,
    baseUri: 'https://mock.launchdarkly.com',
    streamUri: 'https://mock.launchdarkly.com',
    eventsUri: 'https://mock.launchdarkly.com',
    ...options
  };

  // Immediately invoke any logger setup
  if (config.logger?.debug) {
    config.logger.debug('LaunchDarkly client initialized with mock');
  }

  return mockLDClient;
};

// Mock the basicLogger to prevent any real logging setup
LaunchDarkly.basicLogger = (options = {}) => ({
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: options.destination ? 
    (message) => options.destination('debug', message) : 
    () => {},
  log: () => {}
});

test('Logger initialization with SDK key', async (t) => {
  const logger = new Logger();
  process.env.LD_LOG_LEVEL_FLAG_KEY = 'test-log-level-flag';
  assert.equal(logger.FLAG_KEY, null); // Should be null before initialization
  
  try {
    await logger.initialize('fake-sdk-key', { key: 'test-user' }, { logLevelFlagKey: 'test-log-level-flag' });
    assert(logger.ldClient.initialized, 'Client should be initialized');
  } finally {
    // Restore original functions
    LaunchDarkly.init = originalInit;
    LaunchDarkly.basicLogger = originalBasicLogger;
    winston.createLogger = originalCreateLogger;
  }
});

test('Logger initialization with existing client', async (t) => {
  const logger = new Logger();
  const existingClient = {
    waitForInitialization: async () => {},
    variation: async () => LogLevel.INFO
  };
  
  await logger.initialize(existingClient, { key: 'test-user' });
  assert.equal(logger.ldClient, existingClient);
});

test('Logger initialization with invalid parameter', async (t) => {
  const logger = new Logger();
  await assert.rejects(
    async () => {
      await logger.initialize(null, { key: 'test-user' });
    },
    {
      message: 'Logger.initialize requires either an SDK key string or an existing LaunchDarkly client instance'
    }
  );
});

test('Logger initialization creates Winston logger', async (t) => {
  const logger = new Logger();
  assert(logger.logger, 'Winston logger should be created in constructor');
  assert.equal(typeof logger.logger.info, 'function', 'Winston logger should have logging methods');
});

test('Logger uses Winston for LaunchDarkly SDK logging', async (t) => {
  const loggedMessages = [];
  
  // Create Winston logger that captures messages
  winston.createLogger = () => createMockWinstonLogger((msg) => {
    loggedMessages.push(msg);
  });
  
  const logger = new Logger();
  process.env.LD_LOG_LEVEL_FLAG_KEY = 'test-flag';
  const testContext = { key: 'test-user' };
  
  try {
    await logger.initialize('fake-sdk-key', testContext, {
      offline: true,
      streaming: false,
      sendEvents: false,
      useLdd: true
    });
    
    // Verify that initialization logs were captured
    assert(loggedMessages.length > 0, 'Should have captured log messages');
    assert(loggedMessages.some(msg => msg.includes('LaunchDarkly logger initialized')), 
      'Should capture initialization message');
  } finally {
    // Clean up
    LaunchDarkly.init = originalInit;
    LaunchDarkly.basicLogger = originalBasicLogger;
    winston.createLogger = originalCreateLogger;
  }
});
