const LaunchDarkly = require('@launchdarkly/node-server-sdk');

/**
 * Enumeration of available log levels in order of increasing verbosity.
 * Each level includes all levels above it in the hierarchy.
 * For example, INFO level will include FATAL, ERROR, and WARN messages.
 */
const LogLevel = {
  FATAL: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4,
  TRACE: 5
};

/**
 * A logging utility for AWS Lambda that integrates with LaunchDarkly for dynamic log level control.
 * Provides emoji-enhanced console logging with multiple severity levels.
 */
class Logger {
  /**
   * Creates a new Logger instance.
   * The logger starts uninitiated and must be initialized with a LaunchDarkly SDK key
   * and context before use.
   */
  constructor() {
    this.ldClient = null;
    this.FLAG_KEY = 'lambda-console-logging';
  }

  /**
   * Initializes the logger with LaunchDarkly SDK.
   * @param {string|Object} sdkKeyOrClient - Either a LaunchDarkly SDK key or an existing LaunchDarkly client instance
   * @param {Object} context - LaunchDarkly context object for evaluating feature flags
   * @returns {Promise<void>}
   */
  async initialize(sdkKeyOrClient, context) {
    if (typeof sdkKeyOrClient === 'string') {
      const validLevels = ['error', 'warn', 'info', 'debug'];
      const sdkLogLevel = process.env.LD_SDK_LOG_LEVEL?.toLowerCase();
      
      // If level is invalid or not set, SDK will use default 'info'
      const level = validLevels.includes(sdkLogLevel) ? sdkLogLevel : undefined;
      
      this.ldClient = LaunchDarkly.init(sdkKeyOrClient, {
        logger: LaunchDarkly.basicLogger({
          level,
          destination: (level, message) => {
            console.info(`[LaunchDarkly SDK ${level}] ${message}`);
          }
        })
      });
    } else if (sdkKeyOrClient && typeof sdkKeyOrClient === 'object') {
      // Use existing client instance
      this.ldClient = sdkKeyOrClient;
    } else {
      throw new Error('Logger.initialize requires either an SDK key string or an existing LaunchDarkly client instance');
    }
    this.context = context;
    await this.ldClient.waitForInitialization({timeout: 10});
  }

  /**
   * Gets the current log level from LaunchDarkly.
   * Defaults to ERROR level if LaunchDarkly client is not initialized.
   * @returns {Promise<number>} Current log level
   */
  async getCurrentLogLevel() {
    if (!this.ldClient) return LogLevel.ERROR;
    return await this.ldClient.variation(this.FLAG_KEY, this.context, LogLevel.ERROR);
  }

  /**
   * Determines if a message at the given level should be logged based on current settings.
   * @param {number} level - Log level to check
   * @returns {Promise<boolean>} Whether the message should be logged
   */
  async shouldLog(level) {
    const currentLevel = await this.getCurrentLogLevel();
    return level <= currentLevel;
  }

  /**
   * Logs a fatal error message. Used for unrecoverable errors that require immediate attention.
   * @param {...*} args - Messages or objects to log
   */
  async fatal(...args) {
    if (await this.shouldLog(LogLevel.FATAL)) {
      console.error('💀', ...args);
    }
  }

  /**
   * Logs an error message. Used for errors that are severe but not fatal.
   * @param {...*} args - Messages or objects to log
   */
  async error(...args) {
    if (await this.shouldLog(LogLevel.ERROR)) {
      console.error('🔴', ...args);
    }
  }

  /**
   * Logs a warning message. Used for potentially harmful situations.
   * @param {...*} args - Messages or objects to log
   */
  async warn(...args) {
    if (await this.shouldLog(LogLevel.WARN)) {
      console.warn('🟡', ...args);
    }
  }

  /**
   * Logs an informational message. Used for general operational messages.
   * @param {...*} args - Messages or objects to log
   */
  async info(...args) {
    if (await this.shouldLog(LogLevel.INFO)) {
      console.info('🔵', ...args);
    }
  }

  /**
   * Logs a debug message. Used for detailed information for debugging purposes.
   * @param {...*} args - Messages or objects to log
   */
  async debug(...args) {
    if (await this.shouldLog(LogLevel.DEBUG)) {
      console.debug('⚪', ...args);
    }
  }

  /**
   * Logs a trace message. Used for very detailed debugging information.
   * @param {...*} args - Messages or objects to log
   */
  async trace(...args) {
    if (await this.shouldLog(LogLevel.TRACE)) {
      console.trace('🟣', ...args);
    }
  }

  /**
   * Closes the LaunchDarkly client connection.
   * Should be called when the logger is no longer needed.
   */
  async close() {
    await this.ldClient?.close();
  }
}

const logger = new Logger();

module.exports = {
  Logger,
  LogLevel,
  logger
};
