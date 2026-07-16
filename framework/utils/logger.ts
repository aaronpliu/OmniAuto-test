import winston from "winston";
import * as path from "path";
import * as fs from "fs";

export class Logger {
  private static instance: Logger;
  private logger: winston.Logger;
  private fileLogReady = false;

  private constructor() {
    // 只初始化 console transport，file transport 延迟到会话目录就绪后再挂载
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

    // 若环境变量已设置（test worker 场景），立即挂载 file transport
    if (process.env.OMNITEST_SESSION_DIR) {
      this.ensureFileLogging(process.env.OMNITEST_SESSION_DIR);
    }
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * 确保 file transport 已挂载到指定目录下的 test.log。
   * 幂等：多次调用不会创建重复的 file transport。
   * 由 globalSetup 在会话目录创建后调用；test worker 自动在构造时完成。
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
