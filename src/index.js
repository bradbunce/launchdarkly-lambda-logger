/**
 * A LaunchDarkly-powered logging utility for AWS Lambda functions that enables dynamic log level control.
 * Log levels can be adjusted in real-time through LaunchDarkly feature flags without requiring redeployment.
 */

import * as LaunchDarkly from '@launchdarkly/node-server-sdk';

/**
 * Enum representing available log levels in order of increasing verbosity.
 * Each level includes all levels below it (e.g., INFO includes ERROR and WARN).
 */
export const LogLevel = {
  FATAL: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4,
  TRACE: 5
};

/**
 * Logger class that integrates with LaunchDarkly to provide dynamic log level control.
 * Uses emojis for visual distinction between different log levels in CloudWatch logs.
 */
class Logger {
  /**
   * Creates a new Logger instance.
   * The logger starts in an uninitialized state and must be initialized with initialize() before use.
   */
  constructor() {
    this.ldClient = null;
    this.FLAG_KEY = 'lambda-console-logging';
  }

  /**
   * Initializes the LaunchDarkly client with the provided SDK key and user context.
   * Must be called before any logging operations.
   * @param {string} sdkKey - LaunchDarkly SDK key
   * @param {Object} context - LaunchDarkly user context object
   * @returns {Promise<void>}
   */
  async initialize(sdkKey, context) {
    this.ldClient = LaunchDarkly.init(sdkKey);
    this.context = context;
    await this.ldClient.waitForInitialization();
  }

  /**
   * Retrieves the current log level from LaunchDarkly.
   * Defaults to ERROR level if client is not initialized or flag is not found.
   * @returns {Promise<number>} Current log level
   * @private
   */
  async getCurrentLogLevel() {
    if (!this.ldClient) return LogLevel.ERROR;
    return await this.ldClient.variation(this.FLAG_KEY, this.context, LogLevel.ERROR);
  }

  /**
   * Determines if a message at the given level should be logged based on current settings.
   * @param {number} level - Log level to check
   * @returns {Promise<boolean>} Whether the message should be logged
   * @private
   */
  async shouldLog(level) {
    const currentLevel = await this.getCurrentLogLevel();
    return level <= currentLevel;
  }

  /**
   * Logs a fatal error message (💀). Highest severity level for critical errors that cause system failure.
   * @param {...*} args - Arguments to log
   */
  async fatal(...args) {
    if (await this.shouldLog(LogLevel.FATAL)) {
      console.error('💀', ...args);
    }
  }

  /**
   * Logs an error message (🔴). Used for errors that affect functionality but don't crash the system.
   * @param {...*} args - Arguments to log
   */
  async error(...args) {
    if (await this.shouldLog(LogLevel.ERROR)) {
      console.error('🔴', ...args);
    }
  }

  /**
   * Logs a warning message (🟡). Used for potentially harmful situations or deprecated features.
   * @param {...*} args - Arguments to log
   */
  async warn(...args) {
    if (await this.shouldLog(LogLevel.WARN)) {
      console.warn('🟡', ...args);
    }
  }

  /**
   * Logs an info message (🔵). Used for general operational messages about system behavior.
   * @param {...*} args - Arguments to log
   */
  async info(...args) {
    if (await this.shouldLog(LogLevel.INFO)) {
      console.info('🔵', ...args);
    }
  }

  /**
   * Logs a debug message (⚪). Used for detailed system state information useful during development.
   * @param {...*} args - Arguments to log
   */
  async debug(...args) {
    if (await this.shouldLog(LogLevel.DEBUG)) {
      console.debug('⚪', ...args);
    }
  }

  /**
   * Logs a trace message (🟣). Most verbose level, used for detailed debugging information.
   * @param {...*} args - Arguments to log
   */
  async trace(...args) {
    if (await this.shouldLog(LogLevel.TRACE)) {
      console.trace('🟣', ...args);
    }
  }

  /**
   * Closes the LaunchDarkly client connection. Should be called when logging is no longer needed.
   * @returns {Promise<void>}
   */
  async close() {
    await this.ldClient?.close();
  }
}

export const logger = new Logger();

/**
 * Example AWS Lambda handler showing proper logger initialization and usage.
 * Demonstrates initialization, error handling, and cleanup patterns.
 */
export const handler = async (event) => {
  const context = {
    kind: 'user',
    key: 'lambda-user',
    environment: process.env.ENVIRONMENT
  };

  await logger.initialize(process.env.LD_SDK_KEY, context);

  try {
    await logger.debug('Processing event', event);
    // Lambda logic here
    await logger.info('Successfully processed event');
  } catch (error) {
    await logger.error('Error processing event', error);
    throw error;
  } finally {
    await logger.close();
  }
};
