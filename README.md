# LaunchDarkly Lambda Logger

A feature flag-controlled logging utility for AWS Lambda functions that integrates with LaunchDarkly and Winston. This logger enables dynamic control over log levels through LaunchDarkly feature flags, allowing you to adjust logging verbosity in real-time without deploying code changes. Built on Winston for robust logging capabilities with timestamp support and customizable formatting. Note: This utility is specifically designed for logging with dynamic log levels - it does not handle or display LaunchDarkly SDK flag evaluation events.

## Features

- 🎯 **Dynamic Log Level Control**: Adjust log levels in real-time using LaunchDarkly feature flags
- 🎨 **Emoji-Enhanced Logging**: Visual distinction between log levels using emojis
- 📊 **Multiple Log Levels**: Support for FATAL, ERROR, WARN, INFO, DEBUG, and TRACE levels
- ⚡ **AWS Lambda Optimized**: Designed for use in AWS Lambda functions
- 🔧 **Configurable SDK Logging**: Control LaunchDarkly SDK's own logging behavior via feature flags
- 🔄 **Flexible Client Integration**: Works with either a new LaunchDarkly client or an existing one from your application
- ⏰ **Timestamp Support**: Each log entry includes a timestamp for better tracking
- 📝 **Winston Integration**: Built on Winston for robust logging capabilities and customizable formatting

## Log Levels

The logger supports the following levels (in order of increasing verbosity):

- `FATAL` (💀): Unrecoverable errors that require immediate attention
- `ERROR` (🔴): Severe errors that don't prevent the system from running
- `WARN` (🟡): Potentially harmful situations
- `INFO` (🔵): General operational messages
- `DEBUG` (⚪): Detailed information for debugging purposes
- `TRACE` (🟣): Very detailed debugging information

Each level includes all levels above it in the hierarchy. For example, if the log level is set to INFO, all FATAL, ERROR, and WARN messages will also be logged.

## Installation

```bash
npm install @bradbunce/launchdarkly-lambda-logger
```

## Usage

### Environment Variables

- `LD_LOG_LEVEL_FLAG_KEY`: (Required) The LaunchDarkly feature flag key used to control log levels
- `LD_SDK_LOG_LEVEL_FLAG_KEY`: (Optional) The LaunchDarkly feature flag key used to control the SDK's own logging level

### Initialization Options

The logger can be initialized in two ways:

1. With a LaunchDarkly SDK key (creates a new client):
   ```javascript
   await logger.initialize('YOUR_SDK_KEY', context, {
     logLevelFlagKey: 'your-flag-key', // Optional: overrides LD_LOG_LEVEL_FLAG_KEY env var
     sdkLogLevelFlagKey: 'your-sdk-log-level-flag' // Optional: overrides LD_SDK_LOG_LEVEL_FLAG_KEY env var
   });
   ```

2. With an existing LaunchDarkly client (recommended if your app already has one):
   ```javascript
   const ldClient = LaunchDarkly.init('YOUR_SDK_KEY');
   await logger.initialize(ldClient, context, {
     logLevelFlagKey: 'your-flag-key' // Optional: overrides LD_LOG_LEVEL_FLAG_KEY env var
   });
   ```

Using an existing client is recommended when your application already has a LaunchDarkly client instance, as it prevents creating duplicate connections and reduces resource usage.

### Important Note

This utility uses Winston for robust logging with dynamic log levels controlled by LaunchDarkly. Each log entry includes a timestamp and proper formatting for both simple messages and complex objects. It does not log or display LaunchDarkly SDK flag evaluation events. If you need to monitor flag evaluations, you should set up event listeners directly on your LaunchDarkly client:

```javascript
ldClient.on('update', (settings) => {
  console.log('Flag update received:', settings);
});

ldClient.on('change', (settings) => {
  console.log('Flag change detected:', settings);
});
```

### Example Usage

```javascript
const { logger } = require('@bradbunce/launchdarkly-lambda-logger');

exports.handler = async (event, context) => {
  // Set the flag keys via environment variables
  process.env.LD_LOG_LEVEL_FLAG_KEY = 'your-log-level-flag';
  process.env.LD_SDK_LOG_LEVEL_FLAG_KEY = 'your-sdk-log-level-flag';
  
  // Initialize the logger with your LaunchDarkly SDK key and context
  await logger.initialize('YOUR_SDK_KEY', {
    kind: 'user',
    key: 'lambda-function-1'
  });

  // OR use an existing LaunchDarkly client
  const ldClient = LaunchDarkly.init('YOUR_SDK_KEY');
  await logger.initialize(ldClient, {
    kind: 'user',
    key: 'lambda-function-1'
  });

  try {
    // Use different log levels as needed
    await logger.info('Lambda function started');
    await logger.debug('Processing event:', event); // Objects are automatically stringified
    
    // Your lambda function logic here
    
    // Logs will include timestamps and proper formatting
    await logger.info('Lambda function completed successfully');
    return { statusCode: 200 };
  } catch (error) {
    await logger.error('Lambda function failed:', error);
    throw error;
  } finally {
    // Always close the logger to clean up resources
    await logger.close();
  }
};
```

## Configuration

### LaunchDarkly Feature Flags

#### Application Log Level Flag
The logger uses a feature flag to control the application log level. The flag key must be set via the `LD_LOG_LEVEL_FLAG_KEY` environment variable or the `logLevelFlagKey` initialization option.

Create this flag in your LaunchDarkly project with the following configuration:
- **Key**: Set via `LD_LOG_LEVEL_FLAG_KEY` environment variable or `logLevelFlagKey` option
- **Type**: Number
- **Default value**: 1 (ERROR level)
- **Possible values**:
  - 0: FATAL only
  - 1: ERROR and above
  - 2: WARN and above
  - 3: INFO and above
  - 4: DEBUG and above
  - 5: TRACE and above

#### SDK Log Level Flag
You can control the LaunchDarkly SDK's own logging level using a feature flag. The flag key must be set via the `LD_SDK_LOG_LEVEL_FLAG_KEY` environment variable or the `sdkLogLevelFlagKey` initialization option.

Create this flag in your LaunchDarkly project with the following configuration:
- **Key**: Set via `LD_SDK_LOG_LEVEL_FLAG_KEY` environment variable or `sdkLogLevelFlagKey` option
- **Type**: String
- **Default value**: 'error'
- **Possible values**:
  - 'debug': Most verbose logging (includes all levels)
  - 'info': Info and above (includes info, warn, error)
  - 'warn': Warning and above (includes warn, error)
  - 'error': Error messages only
  - 'none': No SDK logging

The SDK log level filtering is hierarchical, meaning each level includes all levels above it. For example, if the SDK log level is set to 'warn', both warning and error messages will be logged, but info and debug messages will be filtered out. If an invalid value is returned by the flag, the SDK will default to 'error' level logging.

### Log Output Format

Logs are formatted using Winston with the following features:
- Timestamps for each log entry
- Log level displayed in uppercase
- Emoji indicators for visual distinction
- Proper JSON formatting for object arguments
- Color-coded output based on log level

Example output:
```
2025-01-29T14:25:30.123Z 🔵 INFO: Lambda function started
2025-01-29T14:25:30.124Z ⚪ DEBUG: Processing event: {
  "version": "2.0",
  "routeKey": "$default",
  "rawPath": "/path"
}
2025-01-29T14:25:30.125Z 🔵 INFO: Lambda function completed successfully
```

## API Reference

### Logger Methods

- `initialize(sdkKeyOrClient: string | Object, context: Object, options?: Object): Promise<void>`
  - Initializes the logger with either a LaunchDarkly SDK key or an existing LaunchDarkly client instance
  - When using a SDK key, a new client will be created
  - When using an existing client, the logger will use that client instead of creating a new one
  - Options:
    - `logLevelFlagKey`: Override the LD_LOG_LEVEL_FLAG_KEY environment variable
    - `sdkLogLevelFlagKey`: Override the LD_SDK_LOG_LEVEL_FLAG_KEY environment variable
  - Must be called before using any logging methods

- `fatal(...args: any[]): Promise<void>`
  - Logs a fatal error message (💀)
  - Use for unrecoverable errors requiring immediate attention

- `error(...args: any[]): Promise<void>`
  - Logs an error message (🔴)
  - Use for severe but non-fatal errors

- `warn(...args: any[]): Promise<void>`
  - Logs a warning message (🟡)
  - Use for potentially harmful situations

- `info(...args: any[]): Promise<void>`
  - Logs an informational message (🔵)
  - Use for general operational information

- `debug(...args: any[]): Promise<void>`
  - Logs a debug message (⚪)
  - Use for detailed debugging information

- `trace(...args: any[]): Promise<void>`
  - Logs a trace message (🟣)
  - Use for very detailed debugging information

- `close(): Promise<void>`
  - Closes the LaunchDarkly client connection
  - Should be called when the logger is no longer needed

## Testing

### Mocking LaunchDarkly Client

When writing tests, you can mock the LaunchDarkly client to control flag values and verify logging behavior. Here's an example:

```javascript
const { Logger, LogLevel } = require('@bradbunce/launchdarkly-lambda-logger');
const LaunchDarkly = require('@launchdarkly/node-server-sdk');

// Mock LaunchDarkly client
const mockLDClient = {
  waitForInitialization: async () => {},
  variation: async (flagKey, context, defaultValue) => {
    // Return different values based on flag key
    if (flagKey === 'app-log-level') {
      return LogLevel.DEBUG; // Control application logging
    }
    if (flagKey === 'sdk-log-level') {
      return 'error'; // Control SDK logging
    }
    return defaultValue;
  },
  close: async () => {}
};

// Replace LaunchDarkly.init with mock
const originalInit = LaunchDarkly.init;
LaunchDarkly.init = () => mockLDClient;

// Test your logging
const logger = new Logger();
await logger.initialize('fake-key', { key: 'test-user' }, {
  logLevelFlagKey: 'app-log-level',
  sdkLogLevelFlagKey: 'sdk-log-level'
});

// Restore original after tests
LaunchDarkly.init = originalInit;
```

### Mocking Winston Logger

You can also mock the Winston logger to capture and verify log output:

```javascript
const winston = require('winston');

// Create a mock logger with message capture
const createMockLogger = (callback) => {
  const logger = {
    levels: {
      fatal: 0,
      error: 1,
      warn: 2,
      info: 3,
      debug: 4,
      trace: 5
    },
    format: winston.format,
    transports: [],
    log(level, message) {
      callback({ level, message });
    }
  };

  // Add level-specific methods
  ['fatal', 'error', 'warn', 'info', 'debug', 'trace'].forEach(level => {
    logger[level] = (msg) => logger.log(level, msg);
  });

  return logger;
};

// Use in tests
const loggedMessages = [];
const mockLogger = createMockLogger(({ level, message }) => {
  loggedMessages.push({ level, message });
});

// Replace Winston's createLogger
const originalCreateLogger = winston.createLogger;
winston.createLogger = () => mockLogger;

// Test logging and verify output
await logger.info('test message');
assert(loggedMessages.some(m => m.message === 'test message'));

// Restore original
winston.createLogger = originalCreateLogger;
```

## Maintenance

### Dependencies

This project uses the following major dependencies:
- `@launchdarkly/node-server-sdk`: ^9.7.3 (production)
- `winston`: ^3.11.0 (production)
- Node.js: >=18.0.0

Development dependencies:
- `eslint`: ^9.0.0
- `@eslint/js`: ^8.57.0
- `glob`: ^10.3.10
- `rimraf`: ^5.0.5

To check for and address any deprecation warnings or updates:

```bash
# Update dependencies to their latest compatible versions
npm update

# Check for any vulnerabilities
npm audit

# Check for outdated packages
npm outdated
```

## License
MIT License

Copyright (c) 2025 Brad Bunce

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
