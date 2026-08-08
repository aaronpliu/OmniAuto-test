import {
  actions,
  device,
  getLogger,
  getRunConfig,
  type ArtifactRef,
  type ILogger,
  type LocatorLike,
  type SwipeDirection,
  type WaitOptions,
} from '@omni';

/**
 * 页面对象抽象基类。
 *
 * 【这一层存在的意义】
 * 如果每个 Page 都直接调 actions，"等页面就绪"、"滚到某元素再点"、"失败前截图"
 * 这类模式会在十几个页面里各写一遍，且写法各不相同 —— 排障时无法建立稳定预期。
 * BasePage 把这些**与具体业务无关、但每页都要用**的能力收敛成受保护的原语，
 * 子类因此只需要表达业务语义（login / toggleNotification），可读性和一致性都由基类兜底。
 *
 * 【为什么基类也只允许调 actions / device】
 * 基类同样属于资产层。它一旦引入框架 SDK 或平台判断，
 * 下游所有页面对象都会被污染，「切换 --framework 即可原样运行」的承诺随之失效。
 */
export abstract class BasePage {
  /** 页面中文名，进入日志与截图文件名 */
  protected abstract readonly pageName: string;

  /** 页面就绪判据：该元素可见即认为本页已渲染完成 */
  protected abstract readonly root: LocatorLike;

  /**
   * 日志器做成 getter 而非构造函数里赋值的字段。
   *
   * 页面对象经常在测试文件的 describe 作用域里就被 new 出来，
   * 那个时刻适配器还没 init、运行时上下文尚未建立。
   * 若在构造函数里调用 getLogger()，就把「对象创建」和「运行时就绪」耦死了；
   * 改成惰性求值后，构造函数可以保持无参且零副作用。
   */
  protected get logger(): ILogger {
    return getLogger().child(this.pageName);
  }

  /* ═══════════════ 页面就绪 ═══════════════ */

  /**
   * 等待页面就绪。
   *
   * @param rootLocator 覆盖默认就绪判据；同一页面在不同入口下判据不同时使用
   * @param options 等待参数；不传则沿用框架配置的默认超时
   */
  async waitUntilLoaded(rootLocator?: LocatorLike, options?: WaitOptions): Promise<void> {
    const target: LocatorLike = rootLocator ?? this.root;
    await actions.waitForVisible(target, {
      timeoutMs: options?.timeoutMs,
      intervalMs: options?.intervalMs,
      message: options?.message ?? `${this.pageName} 未在预期时间内就绪`,
    });
    this.logger.info(`${this.pageName} 已就绪`);
  }

  /** 页面是否已渲染；用于「可能在也可能不在」的探测场景，不抛异常 */
  async isLoaded(): Promise<boolean> {
    return actions.isVisible(this.root);
  }

  /**
   * 断言当前停留在本页。
   *
   * 用 actions.assertVisible 而不是 expect(await isLoaded()).toBe(true)：
   * 前者内部带轮询重试，能吸收动画与网络抖动；后者是一次性快照，
   * 在真机上会制造大量偶发失败。
   */
  async assertLoaded(): Promise<void> {
    await actions.assertVisible(this.root, {
      message: `期望停留在 ${this.pageName}，但其根容器不可见`,
    });
  }

  /** 断言已离开本页（跳转类用例的收尾断言） */
  async assertLeft(): Promise<void> {
    await actions.waitForNotVisible(this.root, {
      message: `期望已离开 ${this.pageName}，但其根容器仍可见`,
    });
  }

  /* ═══════════════ 通用交互原语 ═══════════════ */

  /**
   * 等待元素可见后再点击。
   *
   * actions.tap 默认已带 waitForVisible，这里再显式等一次是为了**分离失败语义**：
   * 等待失败说明元素没出现（页面/数据问题），点击失败说明元素出现了但不可交互
   * （被遮挡、disabled）。两类问题的排查方向完全不同，合并成一条报错会浪费排障时间。
   */
  protected async tapWhenReady(locator: LocatorLike, hint?: string): Promise<void> {
    await actions.waitForVisible(locator, {
      message: hint ?? `${this.pageName}：点击目标未出现`,
    });
    await actions.tap(locator);
  }

  /** 读取元素文本，附带页面名的失败上下文 */
  protected async readText(locator: LocatorLike): Promise<string> {
    return actions.getText(locator);
  }

  /**
   * 在容器内滚动直到目标可见。
   *
   * 封装的价值在于统一 maxSwipes 与方向默认值 —— 各页面各写一套参数时，
   * 同一个"列表底部找不到元素"的问题会因为一处写 5 次、一处写 20 次而表现不一致。
   */
  protected async scrollIntoView(
    container: LocatorLike,
    target: LocatorLike,
    direction: SwipeDirection = 'down',
    maxSwipes: number = 12,
  ): Promise<void> {
    await actions.scrollTo(container, {
      target,
      direction,
      maxSwipes,
    });
  }

  /**
   * 把开关设置到指定状态（幂等）。
   *
   * 【为什么必须先读后写，而不是直接 tap】
   * 开关的初始状态取决于上一个用例留下的持久化数据，直接 tap 会把 on 变成 off。
   * 先用 isSelected 读当前值，只有不一致时才点击 —— 这样同一段代码
   * 无论从哪个初始状态出发，结果都收敛到期望值，用例之间不再互相干扰。
   */
  protected async setSwitch(locator: LocatorLike, expected: boolean): Promise<void> {
    await actions.waitForVisible(locator, {
      message: `${this.pageName}：开关未出现，无法设置状态`,
    });
    const current: boolean = await actions.isSelected(locator);
    if (current === expected) {
      this.logger.debug(`开关已处于期望状态(${String(expected)})，跳过点击`);
      return;
    }
    await actions.tap(locator);
    this.logger.info(`开关状态由 ${String(current)} 切换为 ${String(expected)}`);
  }

  /** 收起键盘；输入后立即断言底部元素时必须先调用，否则元素被键盘遮挡 */
  protected async hideKeyboard(): Promise<void> {
    await actions.dismissKeyboard();
  }

  /* ═══════════════ 设备级能力（供 Workflow 通过 Page 间接使用） ═══════════════ */

  /**
   * 返回上一页。
   *
   * pressBack 语义上源自 Android 硬件返回键，但适配器会在 iOS 上把它映射为导航返回，
   * 因此脚本层直接调用即可 —— 这正是「平台差异下沉到适配器」的典型例子。
   */
  async goBack(): Promise<void> {
    await device.pressBack();
    this.logger.info(`从 ${this.pageName} 执行返回`);
  }

  /**
   * 将 App 切后台 seconds 秒后恢复。
   *
   * 放在 BasePage 而不是让 Workflow 直接调 device：
   * Workflow 的职责是编排页面，一旦它开始直接操作设备，
   * 分层就退化成了「换个名字的测试脚本」。
   */
  async backgroundAndResume(seconds: number): Promise<void> {
    this.logger.info(`App 切后台 ${String(seconds)} 秒后恢复`);
    await device.sendToBackground(seconds);
  }

  /* ═══════════════ 产物采集 ═══════════════ */

  /**
   * 截图并登记为测试产物。
   *
   * 文件名里带上运行环境（框架/平台）是为了让同一用例在三个框架下的截图
   * 能并排比对 —— 这是排查「只有某框架挂」的最快手段。
   * 注意：getRunConfig() 在这里**只用于命名**，绝不允许据此改变任何执行路径。
   */
  async screenshot(name: string, label?: string): Promise<ArtifactRef> {
    const run = getRunConfig();
    const artifact: ArtifactRef = await device.takeScreenshot({
      name: `${this.pageName}-${name}`,
      label: label ?? `${String(run.framework)}/${run.platform}`,
    });
    this.logger.debug(`截图已保存：${artifact.relativePath}`);
    return artifact;
  }

  /** 导出当前视图树，元素找不到时用它定位真实的 testId */
  async dumpPageSource(): Promise<string> {
    return device.getPageSource();
  }
}
