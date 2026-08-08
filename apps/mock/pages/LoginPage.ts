import { actions, type LocatorLike } from '@omni';

import { loginLocators } from '../locators';

import { BasePage } from './BasePage';

/**
 * 登录页页面对象。
 *
 * 对外只暴露业务语义方法（login / 断言错误提示 / 校验必填），
 * 不暴露任何 Locator —— 这样测试用例读起来是「业务在做什么」，
 * 而不是「点了哪个 testId」。元素改名时用例零改动。
 */
export class LoginPage extends BasePage {
  protected readonly pageName: string = '登录页';
  protected readonly root: LocatorLike = loginLocators.screen;

  /* ═══════════════ 表单输入 ═══════════════ */

  /**
   * 填写用户名。
   *
   * 空串走 clearText 而不是 replaceText('')：
   * 部分框架对「输入空字符串」的处理是无操作，导致上一个用例残留的内容没被清掉，
   * 必填校验用例就会莫名其妙地通过。显式区分这两种意图，语义才准确。
   */
  async enterUsername(username: string): Promise<void> {
    if (username.length === 0) {
      await actions.clearText(loginLocators.usernameInput);
      return;
    }
    await actions.replaceText(loginLocators.usernameInput, username, {
      hideKeyboardAfter: true,
    });
  }

  /** 填写密码；空串语义同 enterUsername */
  async enterPassword(password: string): Promise<void> {
    if (password.length === 0) {
      await actions.clearText(loginLocators.passwordInput);
      return;
    }
    await actions.replaceText(loginLocators.passwordInput, password, {
      hideKeyboardAfter: true,
    });
  }

  /** 清空整个表单，让用例从确定的初始状态出发 */
  async clearForm(): Promise<void> {
    await actions.clearText(loginLocators.usernameInput);
    await actions.clearText(loginLocators.passwordInput);
    await this.hideKeyboard();
  }

  /**
   * 提交登录。
   *
   * 点击后主动等加载指示器消失，把「异步等待」关进页面对象内部 ——
   * 否则每个用例都要自己 sleep 或自己等，写法五花八门且极易漏写。
   */
  async submit(): Promise<void> {
    await this.tapWhenReady(loginLocators.submitButton, '登录提交按钮未出现');
    await this.waitForRequestSettled();
  }

  /** 等待登录请求结束（加载指示器消失）；从未出现时立即返回 */
  async waitForRequestSettled(): Promise<void> {
    await actions.waitForGone(loginLocators.loadingIndicator, {
      message: '登录请求超时：加载指示器长时间未消失',
    });
  }

  /** 一步完成登录：等待就绪 → 填表 → 提交 */
  async login(username: string, password: string): Promise<void> {
    await this.waitUntilLoaded();
    await this.enterUsername(username);
    await this.enterPassword(password);
    await this.submit();
  }

  /** 切换密码明文/密文显示 */
  async togglePasswordVisibility(): Promise<void> {
    await this.tapWhenReady(loginLocators.passwordVisibilityToggle, '密码显隐切换按钮未出现');
  }

  /** 提交按钮当前是否可用（表单校验联动的探测点） */
  async isSubmitEnabled(): Promise<boolean> {
    return actions.isEnabled(loginLocators.submitButton);
  }

  /** 读取当前错误提示文案；无提示时由 actions 抛元素未找到 */
  async getErrorMessage(): Promise<string> {
    return this.readText(loginLocators.errorBanner);
  }

  /* ═══════════════ 断言 ═══════════════ */

  /**
   * 断言登录失败并展示了期望的错误文案。
   *
   * 用 match:'contains' 而不是精确相等：服务端文案常带尾部标点或错误码后缀，
   * 精确匹配会让用例变成「文案守卫」，每次运营改一个字就红一片 ——
   * 冒烟用例要守的是「有没有正确地报错」，不是「一个字都不能改」。
   */
  async assertLoginFailed(expectedMessage: string): Promise<void> {
    await actions.assertVisible(loginLocators.errorBanner, {
      message: '期望展示登录错误提示条，但它不可见',
    });
    await actions.assertText(loginLocators.errorBanner, expectedMessage, {
      match: 'contains',
      message: `登录错误提示未包含期望文案「${expectedMessage}」`,
    });
  }

  /** 断言仍停留在登录页（未发生跳转） */
  async assertStillOnLoginPage(): Promise<void> {
    await this.assertLoaded();
    await actions.assertVisible(loginLocators.submitButton, {
      message: '登录表单的提交按钮应仍然可见',
    });
  }

  /** 断言用户名必填校验提示出现 */
  async assertUsernameRequired(): Promise<void> {
    await actions.assertVisible(loginLocators.usernameRequiredHint, {
      message: '期望出现用户名必填校验提示',
    });
  }

  /** 断言密码必填校验提示出现 */
  async assertPasswordRequired(): Promise<void> {
    await actions.assertVisible(loginLocators.passwordRequiredHint, {
      message: '期望出现密码必填校验提示',
    });
  }

  /** 断言未出现任何错误提示条（正向路径的收尾检查） */
  async assertNoError(): Promise<void> {
    await actions.assertNotVisible(loginLocators.errorBanner, {
      message: '不应出现登录错误提示条',
    });
  }
}
