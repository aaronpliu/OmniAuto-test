import winston from "winston";
import * as path from "path";
import * as fs from "fs";

export class Logger {
  private static instance: Logger;
  private logger: winston.Logger;

  private constructor() {
    // Ensure logs directory exists
    const logsDir = path.join(process.cwd(), "artifacts", "logs");
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const logFile = path.join(
      logsDir,
      `test-${new Date().toISOString().replace(/[:.]/g, "-")}.log`
    );

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || "info",
      format: winston.format.combine(
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json()
      ),
      defaultMeta: { service: "test-automation" },
      transports: [
        // Console output
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
              const ts = String(timestamp ?? "");
              const lvl = String(level ?? "").toUpperCase();
              const msg = String(message ?? "");
              return `${ts} [${lvl}]: ${msg} ${
                Object.keys(meta).length ? JSON.stringify(meta) : ""
              }`;
            })
          ),
        }),
        // File output
        new winston.transports.File({
          filename: logFile,
          maxsize: 5242880, // 5MB
          maxFiles: 5,
        }),
      ],
    });
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  debug(message: string, meta?: any): void {
    this.logger.debug(message, meta);
  }

  info(message: string, meta?: any): void {
    this.logger.info(message, meta);
  }

  warn(message: string, meta?: any): void {
    this.logger.warn(message, meta);
  }

  error(message: string, meta?: any): void {
    this.logger.error(message, meta);
  }

  fatal(message: string, meta?: any): void {
    this.logger.error(message, meta);
  }
}
