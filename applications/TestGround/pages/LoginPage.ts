import { BaseActions } from '@framework/actions/BaseActions';
import { by, step, addLog } from '@framework/utils';

/**
 * LoginPage — 同时兼容 Detox (iOS) 和 Appium (Android)
 * 使用统一选择器格式，由框架自动转换为对应平台的原生选择器
 *
 * LoginPage — Compatible with both Detox (iOS) and Appium (Android)
 * Uses unified selector format, framework auto-converts to native selectors
 *
 * 步骤日志 / Step Logging:
 * 使用 step() 函数包裹关键操作，自动记录到 Allure 报告
 */
export class LoginPage {
  private actions: BaseActions;

  constructor(actions: BaseActions) {
    this.actions = actions;
  }

  async login(username: string, password: string): Promise<void> {
    await step('打开应用', async () => {
      await this.actions.navigateTo();
    });

    await step('等待登录界面加载', async () => {
      await this.actions.waitForElement(by.id('usernameInput'), 10000);
    });

    await step(`输入用户名: ${username}`, async () => {
      await this.actions.typeText(by.id('usernameInput'), username);
    });

    await step('输入密码', async () => {
      await this.actions.typeText(by.id('passwordInput'), password);
    });

    await step('点击登录按钮', async () => {
      await this.actions.click(by.id('loginButton'));
    });

    await step('等待登录完成，验证退出按钮可见', async () => {
      await this.actions.waitForElement(by.id('logoutButton'), 10000);
    });

    addLog(`用户 ${username} 登录成功`);
  }

  async expectLoginError(message: string): Promise<void> {
    await step(`验证错误消息: ${message}`, async () => {
      await this.actions.expectText(by.id('loginError'), message);
    });
  }

  async isVisible(): Promise<void> {
    await step('验证用户已登录（查找退出按钮）', async () => {
      await this.actions.expectVisible(by.text('Logout'));
    });
  }
}

