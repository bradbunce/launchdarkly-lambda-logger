const { test } = require('node:test');
const assert = require('node:assert');
const { Logger, LogLevel } = require('../src/index.js');
const winston = require('winston');
const LaunchDarkly = require('@launchdarkly/node-server-sdk');

// Store original module references
const originalCreateLogger = winston.createLogger;
const originalInit = LaunchDarkly.init;
const originalBasicLogger = LaunchDarkly.basicLogger;

// Create a simple mock logger factory
const createMockLogger = (callback) => ({
  levels: {
    fatal: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
    trace: 5
  },
  format: winston.format,
  transports: [new winston.transports.Console()],
  log(level, message) {
    const timestamp = new Date().toISOString();
    const emoji = {
      fatal: '💀',
      error: '🔴',
      warn: '🟡',
      info: '🔵',
      debug: '⚪',
      trace: '🟣'
    };
    const formatted = `${timestamp} ${emoji[level]} ${level.toUpperCase()}: ${message}`;
    callback(formatted);
  },
  error(msg) { this.log('error', msg); },
  warn(msg) { this.log('warn', msg); },
  info(msg) { this.log('info', msg); },
  debug(msg) { this.log('debug', msg); },
  fatal(msg) { this.log('fatal', msg); },
  trace(msg) { this.log('trace', msg); }
});

// Test setup function
const setupTest = () => {
  const loggedMessages = [];
  
  // Override Winston's createLogger
  winston.createLogger = () => createMockLogger((msg) => {
    loggedMessages.push(msg);
    // For debugging: console.log('Captured:', msg);
  });
  
  // Override LaunchDarkly's init
  LaunchDarkly.init = (sdkKey, options = {}) => ({
    waitForInitialization: async () => Promise.resolve(),
    variation: async (key, context, defaultValue) => {
      if (key === 'test-log-level-flag') {
        return LogLevel.DEBUG;
      }
      return defaultValue;
    },
    close: async () => Promise.resolve(),
    initialized: true,
    on: function() { return this; },
    off: function() { return this; }
  });
  
  // Override LaunchDarkly's basicLogger
  LaunchDarkly.basicLogger = (options = {}) => ({
    error: (msg) => {
      loggedMessages.push(`LaunchDarkly SDK ERROR: ${msg}`);
      options.destination?.('error', msg);
    },
    warn: (msg) => {
      loggedMessages.push(`LaunchDarkly SDK WARN: ${msg}`);
      options.destination?.('warn', msg);
    },
    info: (msg) => {
      loggedMessages.push(`LaunchDarkly SDK INFO: ${msg}`);
      options.destination?.('info', msg);
    },
    debug: (msg) => {
      loggedMessages.push(`LaunchDarkly SDK DEBUG: ${msg}`);
      options.destination?.('debug', msg);
    }
  });
  
  return { logger: new Logger(), loggedMessages };
};

// Test cleanup function
const cleanupTest = async (logger) => {
  if (logger) {
    await logger.close();
  }
  winston.createLogger = originalCreateLogger;
  LaunchDarkly.init = originalInit;
  LaunchDarkly.basicLogger = originalBasicLogger;
};

test('Logger initialization with SDK key', async (t) => {
  const { logger } = setupTest();
  process.env.LD_LOG_LEVEL_FLAG_KEY = 'test-log-level-flag';
  
  try {
    await logger.initialize('fake-sdk-key', { key: 'test-user' }, { 
      logLevelFlagKey: 'test-log-level-flag' 
    });
    assert(logger.ldClient, 'Client should be initialized');
    assert.equal(logger.FLAG_KEY, 'test-log-level-flag', 'FLAG_KEY should be set');
  } finally {
    await cleanupTest(logger);
  }
});

test('Logger handles missing SDK log level flag key', async (t) => {
  const { logger } = setupTest();
  process.env.LD_LOG_LEVEL_FLAG_KEY = 'test-log-level-flag';
  delete process.env.LD_SDK_LOG_LEVEL_FLAG_KEY;
  
  try {
    await logger.initialize('fake-sdk-key', { key: 'test-user' }, {
      offline: true,
      logLevelFlagKey: 'test-log-level-flag'
    });
    assert.equal(logger.SDK_LOG_LEVEL_FLAG_KEY, undefined);
    assert(logger.ldClient, 'Client should be initialized');
  } finally {
    await cleanupTest(logger);
  }
});

test('Logger closes LaunchDarkly client', async (t) => {
  const { logger } = setupTest();
  let clientClosed = false;
  
  const testClient = {
    waitForInitialization: async () => {},
    variation: async () => LogLevel.INFO,
    close: async () => {
      clientClosed = true;
    }
  };
  
  try {
    await logger.initialize(testClient, { key: 'test-user' }, {
      logLevelFlagKey: 'test-log-level-flag'
    });
    await logger.close();
    assert(clientClosed, 'LaunchDarkly client should be closed');
  } finally {
    await cleanupTest(logger);
  }
});

test('Logger initialization with SDK log level flag', async (t) => {
  const { logger, loggedMessages } = setupTest();
  process.env.LD_LOG_LEVEL_FLAG_KEY = 'test-log-level-flag';
  process.env.LD_SDK_LOG_LEVEL_FLAG_KEY = 'test-sdk-log-level-flag';
  
  try {
    await logger.initialize('fake-sdk-key', { key: 'test-user' }, {
      offline: true,
      sdkLogLevel: 'debug',
      logLevelFlagKey: 'test-log-level-flag'
    });
    
    assert.equal(logger.SDK_LOG_LEVEL_FLAG_KEY, 'test-sdk-log-level-flag');
    
    // Clear any initialization messages
    loggedMessages.length = 0;
    
    // Test message
    await logger.debug('Test message');
    
    // Debug output
    console.log('Captured messages:', loggedMessages);
    
    // Verify message was logged
    assert(loggedMessages.some(msg => msg.includes('Test message')),
      `Expected to find 'Test message' in logs.\nActual messages: ${JSON.stringify(loggedMessages, null, 2)}`);
    assert(loggedMessages.some(msg => msg.includes('⚪')),
      'Expected to find white circle emoji in logs');
  } finally {
    await cleanupTest(logger);
    delete process.env.LD_SDK_LOG_LEVEL_FLAG_KEY;
  }
});

test('Logger initialization with existing client', async (t) => {
  const { logger } = setupTest();
  const existingClient = {
    waitForInitialization: async () => {},
    variation: async () => LogLevel.INFO,
    close: async () => {}
  };
  process.env.LD_LOG_LEVEL_FLAG_KEY = 'test-log-level-flag';
  
  try {
    await logger.initialize(existingClient, { key: 'test-user' }, {
      logLevelFlagKey: 'test-log-level-flag'
    });
    assert.equal(logger.ldClient, existingClient);
  } finally {
    await cleanupTest(logger);
  }
});

test('Logger initialization with invalid parameter', async (t) => {
  const { logger } = setupTest();
  process.env.LD_LOG_LEVEL_FLAG_KEY = 'test-log-level-flag';
  
  try {
    await assert.rejects(
      () => logger.initialize(null, { key: 'test-user' }),
      {
        message: 'Logger.initialize requires either an SDK key string or an existing LaunchDarkly client instance'
      }
    );
  } finally {
    await cleanupTest(logger);
  }
});

test('Logger respects log level from LaunchDarkly', async (t) => {
  const { logger, loggedMessages } = setupTest();
  process.env.LD_LOG_LEVEL_FLAG_KEY = 'test-log-level-flag';
  
  try {
    await logger.initialize('fake-sdk-key', { key: 'test-user' }, {
      offline: true,
      logLevelFlagKey: 'test-log-level-flag'
    });
    
    // Clear any initialization messages
    loggedMessages.length = 0;
    
    // Test each level individually
    await logger.fatal('Fatal message');
    assert(loggedMessages.some(msg => msg.includes('Fatal message')),
      `Fatal message should be logged\nCaptured messages: ${JSON.stringify(loggedMessages, null, 2)}`);
    
    await logger.error('Error message');
    assert(loggedMessages.some(msg => msg.includes('Error message')),
      'Error message should be logged');
    
    await logger.warn('Warning message');
    assert(loggedMessages.some(msg => msg.includes('Warning message')),
      'Warning message should be logged');
    
    await logger.info('Info message');
    assert(loggedMessages.some(msg => msg.includes('Info message')),
      'Info message should be logged');
    
    await logger.debug('Debug message');
    assert(loggedMessages.some(msg => msg.includes('Debug message')),
      'Debug message should be logged');
    
    await logger.trace('Trace message');
    assert(!loggedMessages.some(msg => msg.includes('Trace message')),
      'Trace message should not be logged');
    
    // Verify emojis
    assert(loggedMessages.some(msg => msg.includes('💀') && msg.includes('Fatal message')),
      'Fatal should have skull emoji');
    assert(loggedMessages.some(msg => msg.includes('🔴') && msg.includes('Error message')),
      'Error should have red circle emoji');
    assert(loggedMessages.some(msg => msg.includes('🟡') && msg.includes('Warning message')),
      'Warning should have yellow circle emoji');
    assert(loggedMessages.some(msg => msg.includes('🔵') && msg.includes('Info message')),
      'Info should have blue circle emoji');
    assert(loggedMessages.some(msg => msg.includes('⚪') && msg.includes('Debug message')),
      'Debug should have white circle emoji');
  } finally {
    await cleanupTest(logger);
  }
});

test('Logger handles missing flag key', async (t) => {
  const { logger } = setupTest();
  delete process.env.LD_LOG_LEVEL_FLAG_KEY;
  
  try {
    await assert.rejects(
      () => logger.initialize('fake-sdk-key', { key: 'test-user' }),
      {
        message: 'Logger requires LD_LOG_LEVEL_FLAG_KEY environment variable or logLevelFlagKey option'
      }
    );
  } finally {
    await cleanupTest(logger);
  }
});

test('Logger handles invalid SDK log level value', async (t) => {
  const { logger, loggedMessages } = setupTest();
  process.env.LD_LOG_LEVEL_FLAG_KEY = 'test-log-level-flag';
  process.env.LD_SDK_LOG_LEVEL_FLAG_KEY = 'test-sdk-log-level-flag';
  
  // Override variation to return invalid log level
  LaunchDarkly.init = (sdkKey, options = {}) => ({
    waitForInitialization: async () => Promise.resolve(),
    variation: async (key, context, defaultValue) => {
      if (key === 'test-sdk-log-level-flag') {
        return 'invalid-level';
      }
      return defaultValue;
    },
    close: async () => Promise.resolve(),
    initialized: true,
    on: function() { return this; },
    off: function() { return this; }
  });
  
  try {
    await logger.initialize('fake-sdk-key', { key: 'test-user' }, {
      logLevelFlagKey: 'test-log-level-flag',
      sdkLogLevelFlagKey: 'test-sdk-log-level-flag'
    });
    
    // Should see warning about invalid log level
    assert(loggedMessages.some(msg => 
      msg.includes('Invalid SDK log level "invalid-level" from flag')),
      'Should log warning about invalid SDK log level');
      
    // Should fall back to error level
    assert(loggedMessages.some(msg => 
      msg.includes('Using default "error"')),
      'Should indicate fallback to error level');
  } finally {
    await cleanupTest(logger);
    delete process.env.LD_SDK_LOG_LEVEL_FLAG_KEY;
  }
});

test('Logger properly creates and cleans up temporary client for SDK log level', async (t) => {
  const { logger } = setupTest();
  process.env.LD_LOG_LEVEL_FLAG_KEY = 'test-log-level-flag';
  process.env.LD_SDK_LOG_LEVEL_FLAG_KEY = 'test-sdk-log-level-flag';
  
  let tempClientCreated = false;
  let tempClientClosed = false;
  let mainClientCreated = false;
  let initCount = 0;
  
  // Track client creation and cleanup
  LaunchDarkly.init = (sdkKey, options = {}) => {
    initCount++;
    // First initialization is the temp client
    if (initCount === 1) {
      tempClientCreated = true;
    } else {
      mainClientCreated = true;
    }
    
    return {
      waitForInitialization: async () => Promise.resolve(),
      variation: async (key, context, defaultValue) => 'debug',
      close: async () => {
        if (initCount === 1) {
          tempClientClosed = true;
        }
      },
      initialized: true,
      on: function() { return this; },
      off: function() { return this; }
    };
  };
  
  try {
    await logger.initialize('fake-sdk-key', { key: 'test-user' }, {
      logLevelFlagKey: 'test-log-level-flag',
      sdkLogLevelFlagKey: 'test-sdk-log-level-flag'
    });
    
    assert(tempClientCreated, 'Temporary client should be created');
    assert(tempClientClosed, 'Temporary client should be closed');
    assert(mainClientCreated, 'Main client should be created');
  } finally {
    await cleanupTest(logger);
    delete process.env.LD_SDK_LOG_LEVEL_FLAG_KEY;
  }
});

test('Logger validates SDK log levels correctly', async (t) => {
  const { logger, loggedMessages } = setupTest();
  process.env.LD_LOG_LEVEL_FLAG_KEY = 'test-log-level-flag';
  process.env.LD_SDK_LOG_LEVEL_FLAG_KEY = 'test-sdk-log-level-flag';
  
  const validLevels = ['debug', 'info', 'warn', 'error', 'none'];
  
  for (const level of validLevels) {
    // Reset mocks for each level
    loggedMessages.length = 0;
    
    LaunchDarkly.init = (sdkKey, options = {}) => ({
      waitForInitialization: async () => Promise.resolve(),
      variation: async (key, context, defaultValue) => {
        if (key === 'test-sdk-log-level-flag') {
          return level;
        }
        return defaultValue;
      },
      close: async () => Promise.resolve(),
      initialized: true,
      on: function() { return this; },
      off: function() { return this; }
    });
    
    try {
      await logger.initialize('fake-sdk-key', { key: 'test-user' }, {
        logLevelFlagKey: 'test-log-level-flag',
        sdkLogLevelFlagKey: 'test-sdk-log-level-flag'
      });
      
      // Should not see any warnings about invalid log level
      assert(!loggedMessages.some(msg => 
        msg.includes('Invalid SDK log level')),
        `Should accept valid log level "${level}"`);
    } finally {
      await cleanupTest(logger);
    }
  }
  
  delete process.env.LD_SDK_LOG_LEVEL_FLAG_KEY;
});