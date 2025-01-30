const { test } = require("node:test");
const assert = require("node:assert");
const { Logger, LogLevel } = require("../src/index.js");
const winston = require("winston");
const LaunchDarkly = require("@launchdarkly/node-server-sdk");

// Store original module references
const originalCreateLogger = winston.createLogger;
const originalInit = LaunchDarkly.init;
const originalBasicLogger = LaunchDarkly.basicLogger;

// Create a simple mock logger factory with level tracking
const createMockLogger = (callback) => {
  const logger = {
    levels: {
      fatal: 0,
      error: 1,
      warn: 2,
      info: 3,
      debug: 4,
      trace: 5,
    },
    format: winston.format,
    transports: [new winston.transports.Console()],
    log(level, message) {
      const timestamp = new Date().toISOString();
      const emoji = {
        fatal: "💀",
        error: "🔴",
        warn: "🟡",
        info: "🔵",
        debug: "⚪",
        trace: "🟣",
      };
      const formatted = `${timestamp} ${
        emoji[level]
      } ${level.toUpperCase()}: ${message}`;
      callback({ level, formatted, message });
    },
  };

  // Add individual level methods
  ["error", "warn", "info", "debug", "fatal", "trace"].forEach((level) => {
    logger[level] = (msg) => logger.log(level, msg);
  });

  return logger;
};

// Test setup function
const setupTest = () => {
  const loggedMessages = [];
  let lastLogLevel = null;

  // Override Winston's createLogger
  winston.createLogger = () =>
    createMockLogger(({ level, formatted, message }) => {
      lastLogLevel = level;
      loggedMessages.push({ level, formatted, message });
    });

  // Override LaunchDarkly's init
  LaunchDarkly.init = (sdkKey, options = {}) => ({
    waitForInitialization: async () => Promise.resolve(),
    variation: async (key, context, defaultValue) => {
      if (key === "test-log-level-flag") {
        return LogLevel.DEBUG;
      }
      if (key === "test-sdk-log-level-flag") {
        return options.sdkLogLevel || "info";
      }
      return defaultValue;
    },
    close: async () => Promise.resolve(),
    initialized: true,
    on: function () {
      return this;
    },
    off: function () {
      return this;
    },
  });

  return {
    logger: new Logger(),
    loggedMessages,
    getLastLogLevel: () => lastLogLevel,
  };
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

test("Log levels are correctly ordered", async (t) => {
  assert.equal(LogLevel.FATAL, 0);
  assert.equal(LogLevel.ERROR, 1);
  assert.equal(LogLevel.WARN, 2);
  assert.equal(LogLevel.INFO, 3);
  assert.equal(LogLevel.DEBUG, 4);
  assert.equal(LogLevel.TRACE, 5);
});

test("shouldLog respects log levels", async (t) => {
  const { logger } = setupTest();
  logger.ldClient = {
    variation: async () => LogLevel.INFO,
  };
  assert.equal(await logger.shouldLog(LogLevel.ERROR), true);
  assert.equal(await logger.shouldLog(LogLevel.DEBUG), false);
});

test("Logger handles missing LD client", async (t) => {
  const logger = new Logger();
  const currentLevel = await logger.getCurrentLogLevel();
  assert.equal(currentLevel, LogLevel.ERROR);
});

test("Logger methods exist", async (t) => {
  const logger = new Logger();
  const methods = ["fatal", "error", "warn", "info", "debug", "trace"];
  methods.forEach((method) => {
    assert.equal(typeof logger[method], "function");
  });
});

test("formatMessage handles different argument types", async (t) => {
  const logger = new Logger();
  assert.equal(logger.formatMessage(["test message"]), "test message");
  assert.equal(logger.formatMessage(["test", 123]), "test 123");
  const obj = { key: "value" };
  assert.equal(logger.formatMessage([obj]), JSON.stringify(obj, null, 2));
  assert.equal(
    logger.formatMessage(["Message:", obj]),
    `Message: ${JSON.stringify(obj, null, 2)}`
  );
});

test("Logger uses Winston for output", async (t) => {
  const { logger, loggedMessages } = setupTest();
  logger.ldClient = {
    variation: async () => LogLevel.INFO,
  };
  await logger.info("test message");
  assert(loggedMessages.some((m) => m.message === "test message"));
});

test("SDK messages are logged at correct Winston levels", async (t) => {
  const { logger, loggedMessages } = setupTest();
  process.env.LD_LOG_LEVEL_FLAG_KEY = "test-log-level-flag";
  process.env.LD_SDK_LOG_LEVEL_FLAG_KEY = "test-sdk-log-level-flag";

  let capturedDestination;
  LaunchDarkly.basicLogger = (options) => {
    capturedDestination = options.destination;
    return {
      error: (msg) => capturedDestination("error", msg),
      warn: (msg) => capturedDestination("warn", msg),
      info: (msg) => capturedDestination("info", msg),
      debug: (msg) => capturedDestination("debug", msg),
    };
  };

  try {
    await logger.initialize(
      "fake-sdk-key",
      { 
        kind: 'multi',
        service: {
          kind: 'service',
          key: 'test-service'
        },
        user: {
          kind: 'user',
          key: 'test-user'
        }
      },
      {
        logLevelFlagKey: "test-log-level-flag",
        sdkLogLevelFlagKey: "test-sdk-log-level-flag",
      }
    );

    // Clear initialization messages
    loggedMessages.length = 0;

    // Send messages at different levels
    capturedDestination("error", "SDK Error message");
    capturedDestination("warn", "SDK Warning message");
    capturedDestination("info", "SDK Info message");
    capturedDestination("debug", "SDK Debug message");

    // Verify messages were logged at correct levels
    const messagesByLevel = loggedMessages.reduce((acc, { level, message }) => {
      acc[level] = acc[level] || [];
      acc[level].push(message);
      return acc;
    }, {});

    assert(
      messagesByLevel.error?.some((msg) => msg.includes("SDK Error message")),
      "Error message should be logged at error level"
    );
    assert(
      messagesByLevel.warn?.some((msg) => msg.includes("SDK Warning message")),
      "Warning message should be logged at warn level"
    );
    assert(
      messagesByLevel.info?.some((msg) => msg.includes("SDK Info message")),
      "Info message should be logged at info level"
    );
    assert(
      messagesByLevel.debug?.some((msg) => msg.includes("SDK Debug message")),
      "Debug message should be logged at debug level"
    );
  } finally {
    await cleanupTest(logger);
  }
});

test("SDK log level controls message filtering", async (t) => {
  const { logger, loggedMessages } = setupTest();
  process.env.LD_LOG_LEVEL_FLAG_KEY = "test-log-level-flag";
  process.env.LD_SDK_LOG_LEVEL_FLAG_KEY = "test-sdk-log-level-flag";

  let capturedDestination;
  LaunchDarkly.basicLogger = (options) => {
    const levelValues = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };

    const shouldLog = (level) => {
      return levelValues[level] >= levelValues[options.level];
    };

    const destination = (level, msg) => {
      if (shouldLog(level)) {
        options.destination(level, msg);
      }
    };

    capturedDestination = destination;
    return {
      error: (msg) => destination("error", msg),
      warn: (msg) => destination("warn", msg),
      info: (msg) => destination("info", msg),
      debug: (msg) => destination("debug", msg)
    };
  };

  // Override variation to return 'error' level
  LaunchDarkly.init = (sdkKey, options = {}) => ({
    waitForInitialization: async () => Promise.resolve(),
    variation: async (key, context, defaultValue) => {
      if (key === "test-sdk-log-level-flag") {
        return "error";
      }
      return defaultValue;
    },
    close: async () => Promise.resolve(),
    initialized: true,
    on: function () {
      return this;
    },
    off: function () {
      return this;
    },
  });

  try {
    await logger.initialize(
      "fake-sdk-key",
      { 
        kind: 'multi',
        service: {
          kind: 'service',
          key: 'test-service'
        },
        user: {
          kind: 'user',
          key: 'test-user'
        }
      },
      {
        logLevelFlagKey: "test-log-level-flag",
        sdkLogLevelFlagKey: "test-sdk-log-level-flag",
      }
    );

    // Clear initialization messages
    loggedMessages.length = 0;

    // Send messages at different levels
    capturedDestination("error", "SDK Error message");
    capturedDestination("warn", "SDK Warning message");
    capturedDestination("info", "SDK Info message");
    capturedDestination("debug", "SDK Debug message");

    // With SDK level set to 'error', only error messages should be logged
    const messages = loggedMessages.map((m) => m.message);
    assert(
      messages.some((msg) => msg.includes("SDK Error message")),
      "Error message should be logged"
    );
    assert(
      !messages.some((msg) => msg.includes("SDK Warning message")),
      "Warning message should not be logged"
    );
    assert(
      !messages.some((msg) => msg.includes("SDK Info message")),
      "Info message should not be logged"
    );
    assert(
      !messages.some((msg) => msg.includes("SDK Debug message")),
      "Debug message should not be logged"
    );
  } finally {
    await cleanupTest(logger);
  }
});

test("Logger initialization with SDK key", async (t) => {
  const { logger } = setupTest();
  process.env.LD_LOG_LEVEL_FLAG_KEY = "test-log-level-flag";

  try {
    await logger.initialize(
      "fake-sdk-key",
      { 
        kind: 'multi',
        service: {
          kind: 'service',
          key: 'test-service'
        },
        user: {
          kind: 'user',
          key: 'test-user'
        }
      },
      {
        logLevelFlagKey: "test-log-level-flag",
      }
    );
    assert(logger.ldClient, "Client should be initialized");
    assert.equal(
      logger.FLAG_KEY,
      "test-log-level-flag",
      "FLAG_KEY should be set"
    );
  } finally {
    await cleanupTest(logger);
  }
});

test("Logger handles missing SDK log level flag key", async (t) => {
  const { logger } = setupTest();
  process.env.LD_LOG_LEVEL_FLAG_KEY = "test-log-level-flag";
  delete process.env.LD_SDK_LOG_LEVEL_FLAG_KEY;

  try {
    await logger.initialize(
      "fake-sdk-key",
      { 
        kind: 'multi',
        service: {
          kind: 'service',
          key: 'test-service'
        },
        user: {
          kind: 'user',
          key: 'test-user'
        }
      },
      {
        offline: true,
        logLevelFlagKey: "test-log-level-flag",
      }
    );
    assert.equal(logger.SDK_LOG_LEVEL_FLAG_KEY, undefined);
    assert(logger.ldClient, "Client should be initialized");
  } finally {
    await cleanupTest(logger);
  }
});

test("Logger closes LaunchDarkly client", async (t) => {
  const { logger } = setupTest();
  let clientClosed = false;

  const testClient = {
    waitForInitialization: async () => {},
    variation: async () => LogLevel.INFO,
    close: async () => {
      clientClosed = true;
    },
  };

  try {
    await logger.initialize(
      testClient,
      { 
        kind: 'multi',
        service: {
          kind: 'service',
          key: 'test-service'
        },
        user: {
          kind: 'user',
          key: 'test-user'
        }
      },
      {
        logLevelFlagKey: "test-log-level-flag",
      }
    );
    await logger.close();
    assert(clientClosed, "LaunchDarkly client should be closed");
  } finally {
    await cleanupTest(logger);
  }
});

test("Logger properly creates and cleans up temporary client for SDK log level", async (t) => {
  const { logger } = setupTest();
  process.env.LD_LOG_LEVEL_FLAG_KEY = "test-log-level-flag";
  process.env.LD_SDK_LOG_LEVEL_FLAG_KEY = "test-sdk-log-level-flag";

  let tempClientCreated = false;
  let tempClientClosed = false;
  let mainClientCreated = false;
  let initCount = 0;

  // Track client creation and cleanup
  LaunchDarkly.init = (sdkKey, options = {}) => {
    initCount++;
    if (initCount === 1) {
      tempClientCreated = true;
    } else {
      mainClientCreated = true;
    }

    return {
      waitForInitialization: async () => Promise.resolve(),
      variation: async (key, context, defaultValue) => "debug",
      close: async () => {
        if (initCount === 1) {
          tempClientClosed = true;
        }
      },
      initialized: true,
      on: function () {
        return this;
      },
      off: function () {
        return this;
      },
    };
  };

  try {
    await logger.initialize(
      "fake-sdk-key",
      { 
        kind: 'multi',
        service: {
          kind: 'service',
          key: 'test-service'
        },
        user: {
          kind: 'user',
          key: 'test-user'
        }
      },
      {
        logLevelFlagKey: "test-log-level-flag",
        sdkLogLevelFlagKey: "test-sdk-log-level-flag",
      }
    );

    assert(tempClientCreated, "Temporary client should be created");
    assert(tempClientClosed, "Temporary client should be closed");
    assert(mainClientCreated, "Main client should be created");
  } finally {
    await cleanupTest(logger);
    delete process.env.LD_SDK_LOG_LEVEL_FLAG_KEY;
  }
});
