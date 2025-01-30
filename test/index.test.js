const { test } = require('node:test');
const assert = require('node:assert');
const { Logger, LogLevel } = require('../src/index');
const winston = require('winston');
const LaunchDarkly = require('@launchdarkly/node-server-sdk');

// Mock Winston format with proper transform chaining
const mockFormat = {
  combine: (...formats) => ({
    transform: (info) => {
      return formats.reduce((result, format) => {
        return format.transform ? format.transform(result) : result;
      }, info);
    }
  }),
  timestamp: () => ({
    transform: (info) => ({ ...info, timestamp: new Date().toISOString() })
  }),
  printf: (template) => ({
    transform: (info) => {
      const formatted = template(info);
      return { ...info, [Symbol.for('message')]: formatted };
    }
  })
};

winston.format = mockFormat;

// Improved mock Winston logger factory
const createBasicMockLogger = (callback) => {
  const logger = {
    levels: {
      fatal: 0,
      error: 1,
      warn: 2,
      info: 3,
      debug: 4,
      trace: 5
    },
    format: null,
    transports: []
  };

  // Add logging methods with proper format handling
  logger.log = (level, msg) => {
    const info = { level, message: msg, timestamp: new Date().toISOString() };
    if (logger.format && logger.format.transform) {
      const transformed = logger.format.transform(info);
      const output = transformed[Symbol.for('message')] || transformed.message || msg;
      if (callback) callback(level, output);
      return output;
    }
    if (callback) callback(level, msg);
    return msg;
  };

  // Add level-specific methods with proper async handling
  ['fatal', 'error', 'warn', 'info', 'debug', 'trace'].forEach(level => {
    logger[level] = (msg) => logger.log(level, msg);
  });

  logger.configure = (options) => {
    Object.assign(logger, options);
    return logger;
  };

  logger.add = () => logger;
  logger.remove = () => logger;
  
  return logger;
};

// Create global mock logger with proper format handling
const mockWinstonLogger = createBasicMockLogger();

// Store original Winston createLogger
const originalCreateLogger = winston.createLogger;

// Replace createLogger with improved mock
winston.createLogger = (config) => {
  const logger = mockWinstonLogger;
  logger.format = config.format;
  logger.levels = config.levels;
  return logger;
};

// Improved mock LaunchDarkly client factory
const createMockLDClient = (options = {}) => ({
  variation: options.variation || (async (flagKey, context, defaultValue) => {
    if (flagKey === options.sdkLogLevelFlagKey) {
      return options.sdkLogLevel || 'error';
    }
    return options.logLevel || LogLevel.INFO;
  }),
  waitForInitialization: async () => {},
  close: async () => {}
});

// Store original LaunchDarkly init and basicLogger
const originalInit = LaunchDarkly.init;
const originalBasicLogger = LaunchDarkly.basicLogger;

// Replace LaunchDarkly.init with improved mock
LaunchDarkly.init = (sdkKey, options = {}) => {
  if (options.logger) {
    return createMockLDClient({
      logLevel: LogLevel.INFO,
      sdkLogLevel: options.logger.level,
      sdkLogLevelFlagKey: options.sdkLogLevelFlagKey
    });
  }
  return createMockLDClient({ logLevel: LogLevel.INFO });
};

// Replace LaunchDarkly.basicLogger with improved mock
LaunchDarkly.basicLogger = (options = {}) => ({
  level: options.level || 'error',
  destination: options.destination || (() => {})
});

// Test Cases
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
  logger.ldClient = createMockLDClient({ logLevel: LogLevel.INFO });
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
  const loggedMessages = [];
  
  // Create fresh mock logger for this test
  const testLogger = createBasicMockLogger((level, msg) => {
    // Only track the actual test messages
    if (msg.includes('message')) {  // Only capture our test messages
      loggedMessages.push({ level, msg });
    }
  });
  
  // Replace global mock with test-specific mock
  const originalCreateLogger = winston.createLogger;
  winston.createLogger = () => {
    const logger = testLogger;
    logger.format = mockFormat.combine(
      mockFormat.timestamp(),
      mockFormat.printf(({ level, message, timestamp }) => {
        const emoji = {
          fatal: '💀',
          error: '🔴',
          warn: '🟡',
          info: '🔵',
          debug: '⚪',
          trace: '🟣'
        };
        return `${timestamp} ${emoji[level]} ${level.toUpperCase()}: ${message}`;
      })
    );
    return logger;
  };
  
  const logger = new Logger();
  // Mock LaunchDarkly client to always return DEBUG level
  logger.ldClient = {
    variation: async () => LogLevel.DEBUG
  };
  
  // Test logging at different levels
  await logger.info('info message');
  await logger.error('error message');
  await logger.warn('warn message');
  await logger.debug('debug message');
  
  // Verify messages were logged at correct levels
  assert.equal(loggedMessages.length, 4, 'Should log all messages');
  assert.ok(loggedMessages.some(log => log.level === 'info' && log.msg.includes('info message')));
  assert.ok(loggedMessages.some(log => log.level === 'error' && log.msg.includes('error message')));
  assert.ok(loggedMessages.some(log => log.level === 'warn' && log.msg.includes('warn message')));
  assert.ok(loggedMessages.some(log => log.level === 'debug' && log.msg.includes('debug message')));

  // Restore original createLogger
  winston.createLogger = originalCreateLogger;
});

test('SDK log messages are mapped to correct Winston levels', async (t) => {
  const loggedMessages = [];
  
  // Create fresh mock logger for this test
  const testLogger = createBasicMockLogger((level, msg) => {
    loggedMessages.push({ level, msg });
  });
  
  // Replace global mock with test-specific mock
  winston.createLogger = () => testLogger;
  
  const logger = new Logger();
  
  let capturedDestination;
  LaunchDarkly.basicLogger = (options) => {
    capturedDestination = options.destination;
    return { level: options.level || 'error' };
  };

  await logger.initialize('fake-key', { key: 'test-user' }, {
    logLevelFlagKey: 'app-log-level',
    sdkLogLevelFlagKey: 'sdk-log-level'
  });

  // Simulate SDK logging at different levels
  capturedDestination('error', 'Error message');
  capturedDestination('warn', 'Warning message');
  capturedDestination('info', 'Info message');
  capturedDestination('debug', 'Debug message');

  // Verify messages were logged at correct levels
  assert.ok(loggedMessages.some(log => log.level === 'error' && log.msg.includes('[LaunchDarkly SDK error] Error message')));
  assert.ok(loggedMessages.some(log => log.level === 'warn' && log.msg.includes('[LaunchDarkly SDK warn] Warning message')));
  assert.ok(loggedMessages.some(log => log.level === 'info' && log.msg.includes('[LaunchDarkly SDK info] Info message')));
  assert.ok(loggedMessages.some(log => log.level === 'debug' && log.msg.includes('[LaunchDarkly SDK debug] Debug message')));
});

test('Logger initializes with valid SDK log level', async (t) => {
  const logger = new Logger();
  let sdkLogLevel;
  
  LaunchDarkly.basicLogger = (options) => {
    sdkLogLevel = options.level;
    return { level: options.level };
  };

  await logger.initialize('fake-key', { key: 'test-user' }, {
    logLevelFlagKey: 'app-log-level',
    sdkLogLevelFlagKey: 'sdk-log-level'
  });

  assert.equal(typeof sdkLogLevel, 'string');
  assert.ok(['debug', 'info', 'warn', 'error', 'none'].includes(sdkLogLevel));
});

test('Logger handles invalid SDK log level', async (t) => {
  const loggedMessages = [];
  let sdkLogLevel;

  // Create fresh mock logger for this test
  const testLogger = createBasicMockLogger((level, msg) => {
    loggedMessages.push({ level, msg });
  });
  
  // Replace global mock
  const originalCreateLogger = winston.createLogger;
  winston.createLogger = () => {
    const logger = testLogger;
    logger.format = mockFormat.combine(
      mockFormat.timestamp(),
      mockFormat.printf(({ level, message }) => message)
    );
    return logger;
  };

  // Store original LaunchDarkly.init
  const originalInit = LaunchDarkly.init;
  const originalBasicLogger = LaunchDarkly.basicLogger;

  // Create a temporary client for initial SDK log level check
  const tempClient = {
    variation: async (flagKey, context, defaultValue) => {
      if (flagKey === 'sdk-log-level') return 'invalid-level';
      return LogLevel.INFO;
    },
    waitForInitialization: async () => {},
    close: async () => {}
  };

  // Replace LaunchDarkly.init to return our temp client
  LaunchDarkly.init = () => tempClient;

  // Mock basicLogger to capture the log level
  LaunchDarkly.basicLogger = (options) => {
    sdkLogLevel = options.level;
    return { level: options.level };
  };

  const logger = new Logger();
  
  await logger.initialize('fake-key', { key: 'test-user' }, {
    logLevelFlagKey: 'app-log-level',
    sdkLogLevelFlagKey: 'sdk-log-level'
  });

  // Check if warning was logged
  const warningLogged = loggedMessages.some(
    log => log.level === 'warn' && 
    log.msg.includes('Invalid SDK log level') && 
    log.msg.includes('invalid-level')
  );

  assert.ok(warningLogged, 'Should log warning about invalid level');
  assert.equal(sdkLogLevel, 'error', 'Should default to error level');

  // Restore original functions
  winston.createLogger = originalCreateLogger;
  LaunchDarkly.init = originalInit;
  LaunchDarkly.basicLogger = originalBasicLogger;
});

test('Logger respects SDK log level constraints', async (t) => {
  const loggedMessages = [];
  
  // Create fresh mock logger for this test
  const testLogger = createBasicMockLogger((level, msg) => {
    // Skip initialization messages
    if (!msg.includes('Direct')) return;
    loggedMessages.push({ level, msg });
  });
  
  // Replace global mock
  const originalCreateLogger = winston.createLogger;
  winston.createLogger = () => {
    const logger = testLogger;
    logger.format = mockFormat.combine(
      mockFormat.timestamp(),
      mockFormat.printf(({ level, message }) => message)
    );
    return logger;
  };

  // Store original functions
  const originalInit = LaunchDarkly.init;
  const originalBasicLogger = LaunchDarkly.basicLogger;

  // Set up LaunchDarkly client to return ERROR level
  let currentLogLevel = LogLevel.ERROR;
  const mockClient = {
    variation: async (flagKey, context, defaultValue) => {
      return currentLogLevel;
    },
    waitForInitialization: async () => {},
    close: async () => {}
  };

  LaunchDarkly.init = () => mockClient;

  // Create logger instance
  const logger = new Logger();
  await logger.initialize('fake-key', { key: 'test-user' }, {
    logLevelFlagKey: 'app-log-level'
  });

  // Test direct logging at different levels
  await logger.error('Direct error message');
  await logger.warn('Direct warning message');
  await logger.info('Direct info message');
  await logger.debug('Direct debug message');

  // Verify only error messages were logged
  const errorMessages = loggedMessages.filter(log => log.level === 'error');
  const nonErrorMessages = loggedMessages.filter(log => log.level !== 'error');

  assert.equal(errorMessages.length, 1, 'Should have exactly one error message');
  assert.equal(nonErrorMessages.length, 0, 'Should not have any non-error messages');
  assert.equal(errorMessages[0].msg, 'Direct error message', 'Should have the correct error message');

  // Restore original functions
  winston.createLogger = originalCreateLogger;
  LaunchDarkly.init = originalInit;
  LaunchDarkly.basicLogger = originalBasicLogger;
});

test('Winston configuration includes custom levels and formatting', async (t) => {
  // Capture Winston configuration
  let capturedConfig;
  winston.createLogger = (config) => {
    capturedConfig = config;
    const mockLogger = createBasicMockLogger();
    mockLogger.format = config.format;
    mockLogger.levels = config.levels;
    return mockLogger;
  };
  
  // Create new logger to trigger Winston config
  new Logger();
  
  // Verify custom levels
  assert.deepEqual(capturedConfig.levels, {
    fatal: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
    trace: 5
  });
  
  // Test formatting with proper transform chain
  const info = { 
    level: 'error', 
    message: 'test message', 
    timestamp: new Date().toISOString() 
  };
  
  const formatted = capturedConfig.format.transform(info);
  const formattedMessage = formatted[Symbol.for('message')] || formatted.message;
  
  assert.ok(
    formattedMessage.includes('🔴') && 
    formattedMessage.includes('ERROR') && 
    formattedMessage.includes('test message'),
    'Error logs should include error emoji and proper formatting'
  );
});

// Cleanup test
test('Cleanup', async (t) => {
  winston.createLogger = originalCreateLogger;
  LaunchDarkly.init = originalInit;
  LaunchDarkly.basicLogger = originalBasicLogger;
});