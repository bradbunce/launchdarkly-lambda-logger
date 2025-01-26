import * as LaunchDarkly from 'launchdarkly-node-server-sdk';

export const LogLevel = {
  FATAL: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4,
  TRACE: 5
};

class Logger {
  constructor() {
    this.ldClient = null;
    this.FLAG_KEY = 'lambda-console-logging';
  }

  async initialize(sdkKey, context) {
    this.ldClient = LaunchDarkly.init(sdkKey);
    this.context = context;
    await this.ldClient.waitForInitialization();
  }

  async getCurrentLogLevel() {
    if (!this.ldClient) return LogLevel.ERROR;
    return await this.ldClient.variation(this.FLAG_KEY, this.context, LogLevel.ERROR);
  }

  async shouldLog(level) {
    const currentLevel = await this.getCurrentLogLevel();
    return level <= currentLevel;
  }

  async fatal(...args) {
    if (await this.shouldLog(LogLevel.FATAL)) {
      console.error('💀', ...args);
    }
  }

  async error(...args) {
    if (await this.shouldLog(LogLevel.ERROR)) {
      console.error('🔴', ...args);
    }
  }

  async warn(...args) {
    if (await this.shouldLog(LogLevel.WARN)) {
      console.warn('🟡', ...args);
    }
  }

  async info(...args) {
    if (await this.shouldLog(LogLevel.INFO)) {
      console.info('🔵', ...args);
    }
  }

  async debug(...args) {
    if (await this.shouldLog(LogLevel.DEBUG)) {
      console.debug('⚪', ...args);
    }
  }

  async trace(...args) {
    if (await this.shouldLog(LogLevel.TRACE)) {
      console.trace('🟣', ...args);
    }
  }

  async close() {
    await this.ldClient?.close();
  }
}

export const logger = new Logger();

// Usage in Lambda:
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