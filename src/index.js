/**
 * LaunchDarkly Lambda Logger
 * 
 * A logging utility for AWS Lambda that integrates with LaunchDarkly for dynamic log level control.
 * Uses LaunchDarkly feature flags to control log levels at runtime, allowing dynamic adjustment
 * of logging verbosity without code changes or redeployment.
 * 
 * Environment Variables:
 * - LD_LOG_LEVEL_FLAG_KEY: LaunchDarkly feature flag key used to control log level
 * - LD_SDK_LOG_LEVEL_FLAG_KEY: LaunchDarkly feature flag key used to control SDK log level
 * 
 * Log Levels (0-5):
 * - FATAL (0): Unrecoverable errors requiring immediate attention
 * - ERROR (1): Severe errors that are not fatal
 * - WARN (2): Potentially harmful situations
 * - INFO (3): General operational messages
 * - DEBUG (4): Detailed information for debugging
 * - TRACE (5): Very detailed debugging information
 */

const LaunchDarkly = require('@launchdarkly/node-server-sdk');
const winston = require('winston');

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
    this.FLAG_KEY = null;
    
    // Initialize Winston logger with custom levels and colors
    this.logger = winston.createLogger({
      levels: {
        fatal: 0,
        error: 1,
        warn: 2,
        info: 3,
        debug: 4,
        trace: 5
      },
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ level, message, timestamp }) => {
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
      ),
      transports: [
        new winston.transports.Console()
      ]
    });

    // Add colors to Winston
    winston.addColors({
      fatal: 'red',
      error: 'red',
      warn: 'yellow',
      info: 'blue',
      debug: 'gray',
      trace: 'magenta'
    });
  }

  /**
   * Initializes the logger with LaunchDarkly SDK.
   * @param {string|Object} sdkKeyOrClient - Either a LaunchDarkly SDK key or an existing LaunchDarkly client instance
   * @param {Object} context - LaunchDarkly context object for evaluating feature flags
   * @param {Object} options - Configuration options
   * @param {string} options.logLevelFlagKey - LaunchDarkly feature flag key for log level control
   * @param {string} options.sdkLogLevelFlagKey - LaunchDarkly feature flag key for SDK log level control
   * @returns {Promise<void>}
   */
  async initialize(sdkKeyOrClient, context, options = {}) {
    this.FLAG_KEY = options.logLevelFlagKey || process.env.LD_LOG_LEVEL_FLAG_KEY;
    this.SDK_LOG_LEVEL_FLAG_KEY = options.sdkLogLevelFlagKey || process.env.LD_SDK_LOG_LEVEL_FLAG_KEY;
    
    if (!this.FLAG_KEY) {
      throw new Error('Logger requires LD_LOG_LEVEL_FLAG_KEY environment variable or logLevelFlagKey option');
    }

    if (typeof sdkKeyOrClient === 'string') {
      // When creating a new LaunchDarkly client, we need to know the SDK log level before initialization
      // since it's part of the client's configuration options. But to get the SDK log level from the
      // feature flag, we need a client to evaluate the flag. To solve this chicken-and-egg problem:
      // 1. Create a temporary client with minimal logging
      // 2. Use it to get the SDK log level from the flag
      // 3. Close it
      // 4. Create the main client with the proper SDK log level
      if (this.SDK_LOG_LEVEL_FLAG_KEY) {
        const validSdkLogLevels = ['debug', 'info', 'warn', 'error', 'none'];
        
        // Step 1: Create temporary client with minimal logging
        const tempClient = LaunchDarkly.init(sdkKeyOrClient, {
          logger: LaunchDarkly.basicLogger({ level: 'error' }) // Use error level to minimize noise during initialization
        });
        
        await tempClient.waitForInitialization({timeout: 2});

        // Step 2: Extract service context for SDK log level evaluation
        const serviceContext = {
          kind: 'service',
          key: context.service?.key || 'default-service',
          name: context.service?.name || 'Default Service',
          environment: process.env.NODE_ENV || 'development'
        };

        // Step 3: Get SDK log level from flag
        let sdkLogLevel = await tempClient.variation(this.SDK_LOG_LEVEL_FLAG_KEY, serviceContext, 'info');
        
        // Step 4: Clean up temporary client
        await tempClient.close();

        // Log the final SDK log level we're using
        console.log('Initializing LaunchDarkly client with SDK log level:', {
          finalLevel: sdkLogLevel,
          source: validSdkLogLevels.includes(sdkLogLevel) ? 'flag' : 'default'
        });

        // Step 5: Create main client with proper SDK log level
        const ldOptions = {
          logger: LaunchDarkly.basicLogger({
            level: sdkLogLevel,
            destination: (level, message) => {
              // Forward SDK messages to Winston at their original level
              this.logger[level](`[LaunchDarkly SDK ${level}] ${message}`);
            }
          }),
          ...options
        };
        
        this.ldClient = LaunchDarkly.init(sdkKeyOrClient, ldOptions);
      } else {
        // No SDK log level flag, use default initialization
        this.ldClient = LaunchDarkly.init(sdkKeyOrClient, options);
      }
    } else if (sdkKeyOrClient && typeof sdkKeyOrClient === 'object') {
      this.ldClient = sdkKeyOrClient;
    } else {
      throw new Error('Logger.initialize requires either an SDK key string or an existing LaunchDarkly client instance');
    }

    this.context = context;
    await this.ldClient.waitForInitialization({timeout: 2});

    // Log initialization details
    this.logger.debug(`🚀 LaunchDarkly logger initialized: ${JSON.stringify({
      context,
      flagKey: this.FLAG_KEY,
      sdkLogLevelFlagKey: this.SDK_LOG_LEVEL_FLAG_KEY
    }, null, 2)}`);
  }

  /**
   * Gets the current log level from LaunchDarkly.
   * Defaults to ERROR level if LaunchDarkly client is not initialized.
   * @returns {Promise<number>} Current log level
   */
  async getCurrentLogLevel() {
    if (!this.ldClient) return LogLevel.ERROR;

    // Add debug logging before evaluation
    this.logger.debug(`🔍 Evaluating log level flag: ${JSON.stringify({
      flagKey: this.FLAG_KEY,
      context: this.context
    }, null, 2)}`);
    
    const logLevel = await this.ldClient.variation(this.FLAG_KEY, this.context, LogLevel.INFO);
    
    // Add debug logging after evaluation
    this.logger.debug(`📊 Log level flag evaluated: ${JSON.stringify({
      flagKey: this.FLAG_KEY,
      context: this.context,
      value: logLevel
    }, null, 2)}`);
    
    return logLevel;
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
      this.logger.log('fatal', this.formatMessage(args));
    }
  }

  /**
   * Logs an error message. Used for errors that are severe but not fatal.
   * @param {...*} args - Messages or objects to log
   */
  async error(...args) {
    if (await this.shouldLog(LogLevel.ERROR)) {
      this.logger.error(this.formatMessage(args));
    }
  }

  /**
   * Logs a warning message. Used for potentially harmful situations.
   * @param {...*} args - Messages or objects to log
   */
  async warn(...args) {
    if (await this.shouldLog(LogLevel.WARN)) {
      this.logger.warn(this.formatMessage(args));
    }
  }

  /**
   * Logs an informational message. Used for general operational messages.
   * @param {...*} args - Messages or objects to log
   */
  async info(...args) {
    if (await this.shouldLog(LogLevel.INFO)) {
      this.logger.info(this.formatMessage(args));
    }
  }

  /**
   * Logs a debug message. Used for detailed information for debugging purposes.
   * @param {...*} args - Messages or objects to log
   */
  async debug(...args) {
    if (await this.shouldLog(LogLevel.DEBUG)) {
      this.logger.debug(this.formatMessage(args));
    }
  }

  /**
   * Logs a trace message. Used for very detailed debugging information.
   * @param {...*} args - Messages or objects to log
   */
  async trace(...args) {
    if (await this.shouldLog(LogLevel.TRACE)) {
      this.logger.log('trace', this.formatMessage(args));
    }
  }

  /**
   * Formats log messages to handle multiple arguments and objects
   * @private
   * @param {Array} args - Arguments to format
   * @returns {string} Formatted message
   */
  formatMessage(args) {
    return args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
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
