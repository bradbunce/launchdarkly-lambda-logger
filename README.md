# LaunchDarkly Lambda Logger

A feature flag-controlled logging utility for AWS Lambda functions that integrates with LaunchDarkly. This logger enables dynamic control over log levels through LaunchDarkly feature flags, allowing you to adjust logging verbosity in real-time without deploying code changes.

## Features

- 🎯 **Dynamic Log Level Control**: Adjust log levels in real-time using LaunchDarkly feature flags
- 🎨 **Emoji-Enhanced Logging**: Visual distinction between log levels using emojis
- 📊 **Multiple Log Levels**: Support for FATAL, ERROR, WARN, INFO, DEBUG, and TRACE levels
- ⚡ **AWS Lambda Optimized**: Designed for use in AWS Lambda functions
- 🔧 **Configurable SDK Logging**: Control LaunchDarkly SDK's own logging behavior

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

```javascript
const { logger } = require('@bradbunce/launchdarkly-lambda-logger');

exports.handler = async (event, context) => {
  // Initialize the logger with your LaunchDarkly SDK key and context
  await logger.initialize('YOUR_SDK_KEY', {
    kind: 'user',
    key: 'lambda-function-1'
  });

  try {
    // Use different log levels as needed
    await logger.info('Lambda function started');
    await logger.debug('Processing event:', event);
    
    // Your lambda function logic here
    
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

### LaunchDarkly Feature Flag

The logger uses a feature flag with the key `lambda-console-logging` to control the log level. Create this flag in your LaunchDarkly project with the following configuration:

- **Key**: `lambda-console-logging`
- **Type**: Number
- **Default value**: 1 (ERROR level)
- **Possible values**:
  - 0: FATAL only
  - 1: ERROR and above
  - 2: WARN and above
  - 3: INFO and above
  - 4: DEBUG and above
  - 5: TRACE and above

### SDK Logging

You can control the LaunchDarkly SDK's own logging level by setting the `LD_SDK_LOG_LEVEL` environment variable:

```javascript
process.env.LD_SDK_LOG_LEVEL = 'error'; // error, warn, info, or debug
```

## API Reference

### Logger Methods

- `initialize(sdkKey: string, context: Object): Promise<void>`
  - Initializes the logger with LaunchDarkly credentials
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

## Maintenance

### Dependencies

This project uses the following major dependencies:
- `@launchdarkly/node-server-sdk`: ^9.7.3 (production)
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

MIT
