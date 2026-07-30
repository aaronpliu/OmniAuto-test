/**
 * 平台通信桥
 * Platform Bridge
 *
 * 定义 Web 测试平台与框架之间的通信协议。
 * 支持 HTTP 和 WebSocket 两种模式（预留，当前为 HTTP 轮询模式）。
 *
 * 使用方式：
 *   const bridge = new PlatformBridge({ url: "http://platform-api:3000" });
 *   bridge.connect();
 *   bridge.sendEvent(event);
 */

import { Logger } from "../core/utils/Logger";
import { EventPublisher, TestEvent } from "./EventPublisher";

const logger = Logger.getInstance();

export interface PlatformBridgeConfig {
  /** 平台 API 地址 */
  url: string;
  /** 认证 Token（可选） */
  token?: string;
  /** 连接超时（ms，默认 5000） */
  timeout?: number;
  /** 是否启用（默认 false，仅 CI 或平台模式下启用） */
  enabled?: boolean;
}

export class PlatformBridge {
  private config: PlatformBridgeConfig;
  private connected = false;
  private eventQueue: TestEvent[] = [];

  constructor(config: PlatformBridgeConfig) {
    this.config = {
      timeout: 5000,
      enabled: false,
      ...config,
    };
  }

  /** 连接到平台 */
  async connect(): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    try {
      // HTTP 健康检查
      const response = await fetch(`${this.config.url}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(this.config.timeout || 5000),
        headers: this.config.token ? { Authorization: `Bearer ${this.config.token}` } : {},
      });

      if (response.ok) {
        this.connected = true;
        logger.info(`[PlatformBridge] Connected to ${this.config.url}`);

        // 注册事件监听，将事件推入队列
        const publisher = EventPublisher.getInstance();
        publisher.enable();

        return true;
      }

      logger.warn(`[PlatformBridge] Connection failed: ${response.status}`);
      return false;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`[PlatformBridge] Connection error: ${msg}`);
      return false;
    }
  }

  /** 是否已连接 */
  get isConnected(): boolean {
    return this.connected;
  }

  /** 发送事件到平台 */
  async sendEvent(event: TestEvent): Promise<void> {
    if (!this.connected) {
      this.eventQueue.push(event);
      return;
    }

    try {
      await fetch(`${this.config.url}/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.config.token ? { Authorization: `Bearer ${this.config.token}` } : {}),
        },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(this.config.timeout || 5000),
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`[PlatformBridge] Send event failed: ${msg}`);
      this.eventQueue.push(event);
    }
  }

  /** 刷新事件队列 */
  async flush(): Promise<void> {
    if (!this.connected || this.eventQueue.length === 0) {
      return;
    }

    const events = [...this.eventQueue];
    this.eventQueue = [];

    for (const event of events) {
      await this.sendEvent(event);
    }
  }

  /** 断开连接 */
  async disconnect(): Promise<void> {
    await this.flush();
    this.connected = false;
    logger.info("[PlatformBridge] Disconnected");
  }
}
