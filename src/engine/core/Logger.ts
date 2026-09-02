export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  tag: string;
  message: string;
  data?: unknown;
  time: number;
}

export type LogSink = (entry: LogEntry) => void;

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

/** Numeric level constants for tests and configuration. */
export const LogLevels = LEVEL_ORDER;

const consoleSink: LogSink = (e) => {
  const text = `[${e.tag}] ${e.message}`;
  if (e.level === 'error') console.error(text, e.data ?? '');
  else if (e.level === 'warn') console.warn(text, e.data ?? '');
  else console.log(text, e.data ?? '');
};

/**
 * Leveled, tagged logger. Entries go to registered sinks and a shared ring
 * buffer so an in-game dev overlay can inspect history without the console.
 */
export class Logger {
  private static minLevel: LogLevel = 'info';
  private static sinks: LogSink[] = [consoleSink];
  private static ring: LogEntry[] = [];
  private static ringLimit = 500;

  constructor(private readonly tag: string) {}

  static setMinLevel(level: LogLevel): void {
    Logger.minLevel = level;
  }

  static addSink(sink: LogSink): void {
    Logger.sinks.push(sink);
  }

  static removeSink(sink: LogSink): void {
    Logger.sinks = Logger.sinks.filter((s) => s !== sink);
  }

  /** Recent entries, oldest first (for dev overlays and crash reports). */
  static history(): readonly LogEntry[] {
    return Logger.ring;
  }

  static clearHistory(): void {
    Logger.ring = [];
  }

  debug(message: string, data?: unknown): void {
    this.emit('debug', message, data);
  }

  info(message: string, data?: unknown): void {
    this.emit('info', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.emit('warn', message, data);
  }

  error(message: string, data?: unknown): void {
    this.emit('error', message, data);
  }

  private emit(level: LogLevel, message: string, data?: unknown): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[Logger.minLevel]) return;
    const entry: LogEntry = { level, tag: this.tag, message, data, time: Date.now() };
    Logger.ring.push(entry);
    if (Logger.ring.length > Logger.ringLimit) Logger.ring.shift();
    for (const sink of Logger.sinks) sink(entry);
  }
}

export function createLogger(tag: string): Logger {
  return new Logger(tag);
}
