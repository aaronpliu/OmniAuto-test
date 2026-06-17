import { BaseActions } from '@framework/actions/BaseActions';

export class LoginPage {
  private actions: BaseActions;

  constructor(actions: BaseActions) {
    this.actions = actions;
  }

  async login(username: string, password: string): Promise<void> {
    await this.actions.navigateTo()
    await this.actions.typeText('usernameInput', username);
    await this.actions.typeText('passwordInput', password);
    await this.actions.click('loginButton');
    await this.actions.waitForElement('logoutButton', 10000);
  }

  async expectLoginError(message: string): Promise<void> {
    await this.actions.expectText('loginError', message);
  }

  async isVisible(): Promise<void> {
    await this.actions.expectVisible('Logout');
  }
}
