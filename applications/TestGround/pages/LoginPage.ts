import { BaseActions } from '@framework/actions/BaseActions';
import { by } from '@framework/utils';

/**
 * LoginPage — 同时兼容 Detox (iOS) 和 Appium (Android)
 * 使用统一选择器格式，由框架自动转换为对应平台的原生选择器
 *
 * LoginPage — Compatible with both Detox (iOS) and Appium (Android)
 * Uses unified selector format, framework auto-converts to native selectors
 */
export class LoginPage {
  private actions: BaseActions;

  constructor(actions: BaseActions) {
    this.actions = actions;
  }

  async login(username: string, password: string): Promise<void> {
    await this.actions.navigateTo()
    // 使用 id: 前缀，同时兼容两套平台
    // Uses id: prefix, compatible with both platforms
    await this.actions.waitForElement(by.id('usernameInput'), 10000);
    await this.actions.typeText(by.id('usernameInput'), username);
    await this.actions.typeText(by.id('passwordInput'), password);
    await this.actions.click(by.id('loginButton'));
    await this.actions.waitForElement(by.id('logoutButton'), 10000);
  }

  async expectLoginError(message: string): Promise<void> {
    await this.actions.expectText(by.id('loginError'), message);
  }

  async isVisible(): Promise<void> {
    // 使用 text: 前缀，按文本内容匹配（跨平台）
    // Uses text: prefix, match by text content (cross-platform)
    await this.actions.expectVisible(by.text('Logout'));
  }
}
