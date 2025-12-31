type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const COLORS = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
} as const;

const resolveLogLevel = (value?: string): LogLevel => {
  if (!value) return 'debug';
  const normalized = value.toLowerCase();
  if (
    normalized === 'debug' ||
    normalized === 'info' ||
    normalized === 'warn' ||
    normalized === 'error'
  ) {
    return normalized;
  }
  return 'info';
};

const defaultLevel = resolveLogLevel(
  process.env.LOG_LEVEL ||
    (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
);

const colorsEnabled =
  process.stdout.isTTY &&
  process.env.NO_COLOR !== '1' &&
  process.env.NO_COLOR !== 'true' &&
  process.env.LOG_COLORS !== 'false';

const colorize = (value: string, color: string) =>
  colorsEnabled ? `${color}${value}${COLORS.reset}` : value;

const levelLabel: Record<LogLevel, string> = {
  debug: 'DEBUG',
  info: 'LOG',
  warn: 'WARN',
  error: 'ERROR',
};

const levelColor: Record<LogLevel, string> = {
  debug: COLORS.magenta,
  info: COLORS.green,
  warn: COLORS.yellow,
  error: COLORS.red,
};

const pid = process.pid;

const shouldLog = (level: LogLevel) =>
  LEVEL_ORDER[level] >= LEVEL_ORDER[defaultLevel];

const formatPrefix = (level: LogLevel, context?: string) => {
  const timestamp = new Date().toISOString();
  const label = colorize(levelLabel[level], levelColor[level]);
  const contextLabel = context
    ? colorize(`[${context}]`, COLORS.cyan)
    : '';
  const base = `${colorize('[Elysia]', COLORS.gray)} ${pid} - ${timestamp} ${label}`;
  return contextLabel ? `${base} ${contextLabel} ` : `${base} `;
};

export class AppLogger {
  constructor(private readonly context?: string) {}

  withContext(context: string) {
    return new AppLogger(context);
  }

  log(message: string, ...args: unknown[]) {
    this.write('info', message, args);
  }

  info(message: string, ...args: unknown[]) {
    this.write('info', message, args);
  }

  warn(message: string, ...args: unknown[]) {
    this.write('warn', message, args);
  }

  error(message: string, ...args: unknown[]) {
    this.write('error', message, args);
  }

  debug(message: string, ...args: unknown[]) {
    this.write('debug', message, args);
  }

  private write(level: LogLevel, message: string, args: unknown[]) {
    if (!shouldLog(level)) {
      return;
    }

    const line = `${formatPrefix(level, this.context)}${message}`;
    const output =
      level === 'error'
        ? console.error
        : level === 'warn'
          ? console.warn
          : console.log;

    if (args.length > 0) {
      output(line, ...args);
    } else {
      output(line);
    }
  }
}

export const logger = new AppLogger();

export const getLogLevel = () => defaultLevel;

export const formatStatus = (status: number) => {
  const color =
    status >= 500
      ? COLORS.red
      : status >= 400
        ? COLORS.yellow
        : status >= 300
          ? COLORS.cyan
          : COLORS.green;
  return colorize(String(status), color);
};
