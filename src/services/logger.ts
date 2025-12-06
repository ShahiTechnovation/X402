enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

interface LogEntry {
  timestamp: Date
  level: string
  message: string
  data?: unknown
}

class Logger {
  private logs: LogEntry[] = []
  private maxLogs = 1000
  private logLevel = LogLevel.INFO

  log(level: LogLevel, message: string, data?: unknown): void {
    if (level < this.logLevel) return

    const entry: LogEntry = {
      timestamp: new Date(),
      level: LogLevel[level],
      message,
      data,
    }

    this.logs.push(entry)
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs)
    }

    // Also log to console in development
    if (process.env.NODE_ENV === 'development') {
      const style = this.getConsoleStyle(level)
      console.log(`%c[${entry.timestamp.toISOString()}] ${level}:`, style, message, data)
    }
  }

  debug(message: string, data?: unknown): void {
    this.log(LogLevel.DEBUG, message, data)
  }

  info(message: string, data?: unknown): void {
    this.log(LogLevel.INFO, message, data)
  }

  warn(message: string, data?: unknown): void {
    this.log(LogLevel.WARN, message, data)
  }

  error(message: string, data?: unknown): void {
    this.log(LogLevel.ERROR, message, data)
  }

  getLogs(): LogEntry[] {
    return [...this.logs]
  }

  clearLogs(): void {
    this.logs = []
  }

  setLogLevel(level: LogLevel): void {
    this.logLevel = level
  }

  private getConsoleStyle(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG:
        return 'color: #888'
      case LogLevel.INFO:
        return 'color: #0066cc'
      case LogLevel.WARN:
        return 'color: #ff9900'
      case LogLevel.ERROR:
        return 'color: #cc0000'
      default:
        return ''
    }
  }
}

export const logger = new Logger()
