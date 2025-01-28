const { test } = require('node:test');
const assert = require('node:assert');
const { Logger, LogLevel } = require('../src/index.js');

// Mock LaunchDarkly module
const mockLDClient = {
  waitForInitialization: async () => {},
  variation: async () => LogLevel.INFO,
  close: async () => {}
};

// Store original LaunchDarkly module
const LaunchDarkly = require('@launchdarkly/node-server-sdk');
const originalInit = LaunchDarkly.init;
const originalBasicLogger = LaunchDarkly.basicLogger;

// Replace functions with mocks
LaunchDarkly.init = () => mockLDClient;
LaunchDarkly.basicLogger = () => ({});

test('Logger initialization with SDK key', async (t) => {
  const logger = new Logger();
  process.env.LD_LOG_LEVEL_FLAG_KEY = 'test-log-level-flag';
  assert.equal(logger.FLAG_KEY, null); // Should be null before initialization
  
  try {
    await logger.initialize('fake-sdk-key', { key: 'test-user' }, { logLevelFlagKey: 'test-log-level-flag' });
    assert.equal(logger.ldClient, mockLDClient);
  } finally {
    // Restore original functions
    LaunchDarkly.init = originalInit;
    LaunchDarkly.basicLogger = originalBasicLogger;
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
