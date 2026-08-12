import winston from "winston";
import * as path from "path";
import * as fs from "fs";
import { env } from "@configs/env";

export class Logger {
  private static instance: Logger;
  private logger: winston.Logger;
  private fileLogReady = false;

  private constructor() {
    // Only initialize the console transport; defer the file transport until the session directory is ready.
    const rawLevel = env.LOG_LEVEL;
    // Winston has no "trace" level, so map "trace" to "debug" (most verbose).
    const winstonLevel = rawLevel === "trace" ? "debug" : rawLevel;
    this.logger = winston.createLogger({
      level: winstonLevel,
      format: winston.format.combine(
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json()
      ),
      defaultMeta: { service: "test-automation" },
      transports: [
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
      ],
    });

    // If the env var is already set (test worker scenario), mount the file transport immediately.
    if (env.OMNITEST_SESSION_DIR) {
      this.ensureFileLogging(env.OMNITEST_SESSION_DIR);
    }
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Ensure the file transport is mounted to test.log under the given directory.
   * Idempotent: repeated calls will not create duplicate file transports.
   * Called by globalSetup after the session directory is created; test workers
   * mount it automatically during construction.
   */
  ensureFileLogging(logDir: string): void {
    if (this.fileLogReady) {
      return;
    }

    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logFile = path.join(logDir, "test.log");
    this.logger.add(
      new winston.transports.File({
        filename: logFile,
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      })
    );

    this.fileLogReady = true;
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
