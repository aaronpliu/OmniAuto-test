/**
 * 步骤记录器
 * Step Recorder
 *
 * 统一的步骤记录服务，将操作记录为测试步骤并分发给 ReportManager。
 * 阶段二将从 ActionProxy.ts 中提取步骤记录逻辑到此处。
 *
 * 当前为骨架实现，阶段二填充具体逻辑。
 */

import { StepRecord, StepStatus } from "../interfaces/IReporter";
import { ReportManager } from "./ReportManager";

export class StepRecorder {
  private reportManager: ReportManager;

  constructor(reportManager: ReportManager) {
    this.reportManager = reportManager;
  }

  /**
   * 记录一个成功的步骤
   */
  recordPass(name: string, start: number, stop: number): void {
    this.record(name, "passed", start, stop);
  }

  /**
   * 记录一个失败的步骤
   */
  recordFail(name: string, start: number, stop: number, error: string, screenshot?: string): void {
    this.record(name, "failed", start, stop, error, screenshot);
  }

  /**
   * 记录步骤（统一入口）
   */
  record(
    name: string,
    status: StepStatus,
    start: number,
    stop: number,
    error?: string,
    screenshot?: string
  ): void {
    const step: StepRecord = { name, status, start, stop, error, screenshot };
    this.reportManager.recordStep(step);
  }
}
