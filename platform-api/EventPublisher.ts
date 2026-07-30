/**
 * 事件发布器
 * Event Publisher
 *
 * 发布测试执行过程中的事件，供 Web 测试平台实时监听。
 * 支持事件类型：testStart, stepComplete, screenshot, testResult, suiteComplete
 *
 * 使用方式：
 *   const publisher = EventPublisher.getInstance();
 *   publisher.emit("stepComplete", { name: "点击登录按钮", status: "passed" });
 */

import { Logger } from "../core/utils/Logger";

const logger = Logger.getInstance();

/** 事件类型定义 */
export type TestEventType =
  | "testStart"
  | "stepComplete"
  | "screenshot"
  | "recordingComplete"
  | "testResult"
  | "suiteComplete";

/** 事件载荷 */
export interface TestEvent {
  /** 事件类型 */
  type: TestEventType;
  /** 事件时间戳 */
  timestamp: string;
  /** 事件数据 */
  data: Record<string, unknown>;
}

/** 事件监听器 */
export type EventListener = (event: TestEvent) => void;

export class EventPublisher {
  private static instance: EventPublisher;
  private listeners = new Map<TestEventType, EventListener[]>();
  private enabled = false;

  private constructor() {}

  static getInstance(): EventPublisher {
    if (!EventPublisher.instance) {
      EventPublisher.instance = new EventPublisher();
    }
    return EventPublisher.instance;
  }

  /** 启用事件发布 */
  enable(): void {
    this.enabled = true;
    logger.info("[EventPublisher] 已启用");
  }

  /** 禁用事件发布 */
  disable(): void {
    this.enabled = false;
  }

  /** 是否已启用 */
  get isEnabled(): boolean {
    return this.enabled;
  }

  /** 注册事件监听器 */
  on(type: TestEventType, listener: EventListener): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(listener);
  }

  /** 移除事件监听器 */
  off(type: TestEventType, listener: EventListener): void {
    const listeners = this.listeners.get(type);
    if (listeners) {
      const idx = listeners.indexOf(listener);
      if (idx >= 0) {
        listeners.splice(idx, 1);
      }
    }
  }

  /** 发布事件 */
  emit(type: TestEventType, data: Record<string, unknown>): void {
    if (!this.enabled) {
      return;
    }

    const event: TestEvent = {
      type,
      timestamp: new Date().toISOString(),
      data,
    };

    const listeners = this.listeners.get(type);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          logger.warn(`[EventPublisher] Listener error for ${type}: ${msg}`);
        }
      }
    }
  }

  /** 发布测试开始事件 */
  emitTestStart(testName: string, platform: string): void {
    this.emit("testStart", { testName, platform });
  }

  /** 发布步骤完成事件 */
  emitStepComplete(name: string, status: string, durationMs: number): void {
    this.emit("stepComplete", { name, status, durationMs });
  }

  /** 发布截图事件 */
  emitScreenshot(name: string, path: string): void {
    this.emit("screenshot", { name, path });
  }

  /** 发布测试结果事件 */
  emitTestResult(testName: string, status: string, durationMs: number, error?: string): void {
    this.emit("testResult", { testName, status, durationMs, error });
  }

  /** 发布测试套件完成事件 */
  emitSuiteComplete(totalTests: number, passed: number, failed: number): void {
    this.emit("suiteComplete", { totalTests, passed, failed });
  }

  /** 清除所有监听器 */
  clearAll(): void {
    this.listeners.clear();
  }
}
