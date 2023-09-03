export enum LogLevel {
  DEBUG = 0,
  LOG = 1,
  INFO = 2,
  ERROR = 3,
  NONE = 4,
}

function debug(...args: typeof console.debug extends (...args: infer A) => unknown ? A : never) {
  console.debug(...args);
}

function log(...args: typeof console.log extends (...args: infer A) => unknown ? A : never) {
  console.log(...args);
}

function info(...args: typeof console.info extends (...args: infer A) => unknown ? A : never) {
  console.info(...args);
}

function error(...args: typeof console.info extends (...args: infer A) => unknown ? A : never) {
  console.error(...args);
}

const noop = () => {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
};

const logLevel = (process.env.LOGGER_LEVEL || LogLevel.DEBUG) as LogLevel;
/**
 * Wrapper around `console` methods to allow a developer to control logging via
 * `process.env.LOG_LEVEL`, see {@link LogLevel}. If not provided defaults to `LogLevel.LOG`.
 */
export default {
  debug: LogLevel.DEBUG >= logLevel ? debug : noop,
  log: LogLevel.LOG >= logLevel ? log : noop,
  info: LogLevel.INFO >= logLevel ? info : noop,
  error: LogLevel.ERROR >= logLevel ? error : noop,
} as const;
