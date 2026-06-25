/**
 * 测试上下文管理器
 * Test Context Manager
 *
 * 用于在测试文件和生命周期钩子之间共享 actions 实例，
 * 以便在测试失败时自动截屏/录制视频。
 */
export class TestContext {
  private static actions: any = null;
  private static recordingStarted = false;

  /**
   * 设置当前测试的 actions 实例
   */
  static setActions(actions: any): void {
    this.actions = actions;
  }

  /**
   * 获取当前测试的 actions 实例
   */
  static getActions(): any {
    return this.actions;
  }

  /**
   * 标记录屏状态
   */
  static setRecordingStarted(started: boolean): void {
    this.recordingStarted = started;
  }

  /**
   * 是否正在录屏
   */
  static isRecordingStarted(): boolean {
    return this.recordingStarted;
  }

  /**
   * 清理上下文
   */
  static clear(): void {
    this.actions = null;
    this.recordingStarted = false;
  }
}
