import { BaseActions } from "@omnitest/core/actions/BaseActions";

export class LoginPage {
  private actions: BaseActions;

  constructor(actions: BaseActions) {
    this.actions = actions;
  }

  async login(username: string, password: string): Promise<void> {
    await this.actions.typeText("username-field", username);
    await this.actions.typeText("password-field", password);
    await this.actions.click("login-button");
    await this.actions.waitForElement("home-screen", 10000);
  }

  async expectLoginError(message: string): Promise<void> {
    await this.actions.expectText("error-message", message);
  }

  async isVisible(): Promise<void> {
    await this.actions.expectVisible(by.text("login-screen"));
  }
}
