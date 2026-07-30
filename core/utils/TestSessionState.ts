/**
 * TestSessionState — 测试会话生命周期状态管理
 *
 * 提供统一的会话状态标记，所有异步操作在调用 driver 前检查此状态，
 * 避免在 afterEach 执行后仍有飞行中的操作尝试访问已销毁的 driver。
 * 这是架构级的「事前预防」机制，替代原来仅靠错误消息文本匹配的「事后补救」。
 */
class TestSessionStateManager {
  private _tearingDown = false;

  /** 标记当前测试会话正在销毁（afterEach 开始时调用） */
  markTearingDown(): void {
    this._tearingDown = true;
  }

  /** 重置状态（beforeEach 开始时调用） */
  reset(): void {
    this._tearingDown = false;
  }

  /** 会话是否仍活跃（未进入销毁阶段） */
  get isActive(): boolean {
    return !this._tearingDown;
  }

  /** 会话是否正在销毁 */
  get isTearingDown(): boolean {
    return this._tearingDown;
  }
}

// eslint-disable-next-line @typescript-eslint/naming-convention -- PascalCase intentional: singleton instance
export const TestSessionState = new TestSessionStateManager();
