import { spawn, ChildProcess } from "child_process";
import { createWriteStream, existsSync, mkdirSync, WriteStream } from "fs";
import { join } from "path";
import axios from "axios";
import { Logger } from "../utils/logger";
import { mobileConfig } from "./mobileConfig";

const logger = Logger.getInstance();

export class AppiumServer {
  private process: ChildProcess | null = null;
  private port: number;
  private host: string;

  constructor(port: number = 4723, host: string = "0.0.0.0") {
    this.port = port;
    this.host = host;
  }

  /**
   * 检测 Appium server 是否已在运行
   */
  async isRunning(): Promise<boolean> {
    try {
      const response = await axios.get(`http://localhost:${this.port}/status`, {
        timeout: 3000,
      });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  private logStream: WriteStream | null = null;

  /**
   * 启动 Appium server（日志写入独立文件，不污染测试终端）
   */
  async start(): Promise<void> {
    const running = await this.isRunning();
    if (running) {
      logger.info(`Appium server 已在端口 ${this.port} 运行`);
      return;
    }

    // 使用本次执行的会话目录（由 globalSetup 创建并写入环境变量）
    const sessionDir = process.env.OMNITEST_SESSION_DIR;
    const logDir = sessionDir ? sessionDir : join(process.cwd(), "artifacts", "logs");
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }

    // Appium 日志文件
    const logFile = join(logDir, `appium-server-${Date.now()}.log`);
    this.logStream = createWriteStream(logFile, { flags: "a" });

    logger.info(`正在启动 Appium server (${this.host}:${this.port})...`);
    logger.info(`Appium 日志: ${logFile}`);

    this.process = spawn(
      "appium",
      [
        "--port",
        this.port.toString(),
        "--address",
        this.host,
        "--allow-insecure",
        "chromedriver_autodownload",
        "--relaxed-security",
        "--log-level",
        "info",
      ],
      {
        detached: false,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    // 将 stdout 写入日志文件
    if (this.process.stdout) {
      this.process.stdout.pipe(this.logStream);
    }

    // 将 stderr 也写入同一日志文件
    if (this.process.stderr) {
      this.process.stderr.pipe(this.logStream);
    }

    // 等待 server 就绪
    await this.waitForReady();

    logger.info(`Appium server 启动成功 (PID: ${this.process.pid})`);
  }

  /**
   * 等待 Appium server 就绪
   */
  private async waitForReady(timeout: number = 30000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const running = await this.isRunning();
      if (running) {
        return;
      }
      await this.sleep(1000);
    }

    throw new Error(`Appium server 启动超时 (${timeout}ms)`);
  }

  /**
   * 停止 Appium server
   */
  async stop(): Promise<void> {
    if (this.process && !this.process.killed) {
      logger.info(`正在停止 Appium server (PID: ${this.process.pid})...`);

      this.process.kill("SIGTERM");

      await new Promise<void>((resolve) => {
        if (this.process) {
          this.process.on("close", () => {
            logger.info("Appium server 已停止");
            resolve();
          });

          setTimeout(() => {
            if (this.process && !this.process.killed) {
              this.process.kill("SIGKILL");
              logger.warn("Appium server 已强制终止");
            }
            resolve();
          }, 5000);
        } else {
          resolve();
        }
      });

      this.process = null;
    } else {
      logger.info("Appium server 未运行或已停止");
    }

    // 关闭日志文件流
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }

  /**
   * 获取 Appium server 进程
   */
  getProcess(): ChildProcess | null {
    return this.process;
  }

  /**
   * 获取配置的端口
   */
  getPort(): number {
    return this.port;
  }

  /**
   * 睡眠函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// 导出单例
let appiumServerInstance: AppiumServer | null = null;

export function getAppiumServer(): AppiumServer {
  if (!appiumServerInstance) {
    const serverConfig = mobileConfig.getAppiumServerConfig();
    const port = parseInt(process.env.APPIUM_PORT || String(serverConfig.port) || "4723", 10);
    const host = process.env.APPIUM_HOST || serverConfig.host || "0.0.0.0";
    appiumServerInstance = new AppiumServer(port, host);
  }
  return appiumServerInstance;
}
