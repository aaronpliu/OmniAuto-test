import { defineLocator, defineLocators } from '@omni';

/**
 * 登录页定位器集合。
 *
 * 【为什么整页只用 testId，不用 xpath / id】
 * testId 是唯一在三个框架、两个平台上都能无损表达的策略：
 * Detox 只认 by.id/by.text/by.label（没有 xpath），Appium 认 accessibility id，
 * XCUITest 认 accessibilityIdentifier —— 它们的交集就是 testId。
 * 一旦这里出现 xpath，Detox 侧会直接抛 UnsupportedLocatorError，
 * 「一份脚本跑三框架」的承诺当场破产，所以本目录把 testId 当作硬约定。
 */

/**
 * 登录表单容器。
 * 单独抽成常量而不是内联进 submitButton，是因为它同时被 ancestor 约束和
 * 「表单整体是否渲染」的等待复用 —— 抽出来才能保证两处引用的是同一份描述，
 * 将来改 testId 只需改一个地方。
 */
const loginForm = defineLocator({
  testId: 'login_form',
  type: 'other',
  description: '登录表单容器',
});

export const loginLocators = defineLocators({
  /** 页面根节点，作为 BasePage.waitUntilLoaded 的就绪判据 */
  screen: {
    testId: 'login_screen',
    type: 'other',
    description: '登录页根容器',
  },

  form: loginForm,

  brandLogo: {
    testId: 'login_brand_logo',
    type: 'image',
    description: '登录页品牌 Logo',
  },

  usernameInput: {
    testId: 'login_username_input',
    type: 'input',
    description: '用户名输入框',
  },

  passwordInput: {
    testId: 'login_password_input',
    type: 'input',
    description: '密码输入框',
  },

  /**
   * 【平台差异示例 ①】密码明文切换按钮。
   *
   * iOS 侧由 SwiftUI 自绘按钮承载，标识为 login_password_reveal；
   * Android 侧用的是 Material TextInputLayout 自带的 endIcon，
   * 其标识由组件库生成、无法与 iOS 对齐，只能是 login_password_reveal_btn。
   *
   * 这类差异**只允许**写进 platform 覆盖块。若改用
   * `if (platform === 'android')` 在页面对象里分叉，差异就会从「数据」变成「控制流」，
   * 每多一个平台就要多一条分支，最终没人敢动这段代码。
   */
  passwordVisibilityToggle: {
    testId: 'login_password_reveal',
    type: 'button',
    description: '密码明文/密文切换按钮',
    platform: {
      android: { testId: 'login_password_reveal_btn' },
    },
  },

  /**
   * 【层级约束示例 ①】登录提交按钮。
   *
   * 页面底部的「游客体验」区块里也有一个 testId 相同的按钮（历史包袱，短期改不掉），
   * 因此必须用 ancestor 把命中范围收敛到登录表单内部。
   * 用 ancestor 而不是 index，是因为 index 依赖渲染顺序 —— 一旦 UI 调整就静默错位，
   * 而 ancestor 表达的是稳定的结构关系。
   */
  submitButton: {
    testId: 'login_submit_button',
    type: 'button',
    ancestor: loginForm,
    description: '登录表单内的提交按钮',
  },

  errorBanner: {
    testId: 'login_error_banner',
    type: 'text',
    description: '登录失败错误提示条',
  },

  usernameRequiredHint: {
    testId: 'login_username_error',
    type: 'text',
    description: '用户名必填校验提示',
  },

  passwordRequiredHint: {
    testId: 'login_password_error',
    type: 'text',
    description: '密码必填校验提示',
  },

  loadingIndicator: {
    testId: 'login_loading',
    type: 'other',
    description: '登录请求进行中的加载指示器',
  },

  forgotPasswordLink: {
    testId: 'login_forgot_password',
    type: 'link',
    description: '忘记密码链接',
  },
});
