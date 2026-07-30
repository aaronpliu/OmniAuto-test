/**
 * 报告管理器
 * Report Manager
 *
 * 聚合多个报告后端（Allure、JSON、平台 API），
 * 提供统一的步骤记录、截图、录屏接口。
 *
 * 阶段一仅定义骨架，阶段二填充具体实现。
 */

import { IReporter, StepRecord, LogLevel } from "../interfaces/IReporter";

export class ReportManager {
  private static instance: ReportManager;
  private backends: IReporter[] = [];

  private constructor() {}

  static getInstance(): ReportManager {
    if (!ReportManager.instance) {
      ReportManager.instance = new ReportManager();
    }
    return ReportManager.instance;
  }

  /** 注册报告后端 */
  addBackend(backend: IReporter): void {
    this.backends.push(backend);
  }

  /** 移除报告后端 */
  removeBackend(name: string): void {
    this.backends = this.backends.filter((b) => b.name !== name);
  }

  /** 记录步骤（分发到所有后端） */
  recordStep(step: StepRecord): void {
    for (const backend of this.backends) {
      backend.recordStep(step);
    }
  }

  /** 附加截图（分发到所有后端） */
  attachScreenshot(name: string, path: string): void {
    for (const backend of this.backends) {
      backend.attachScreenshot(name, path);
    }
  }

  /** 附加录屏（分发到所有后端） */
  attachRecording(name: string, buffer: Buffer): void {
    for (const backend of this.backends) {
      backend.attachRecording(name, buffer);
    }
  }

  /** 记录日志（分发到所有后端） */
  log(level: LogLevel, message: string): void {
    for (const backend of this.backends) {
      backend.log(level, message);
    }
  }

  /** 生成所有后端的报告 */
  async generate(): Promise<void> {
    for (const backend of this.backends) {
      await backend.generate();
    }
  }

  /** 已注册后端数量 */
  get backendCount(): number {
    return this.backends.length;
  }
}
