import { BaseActions } from "@omnitest/core/actions/BaseActions";
import { by } from "@omnitest/core/selector";

/**
 * HomePage — 同时兼容 Detox (iOS) 和 Appium (Android)
 * HomePage — Compatible with both Detox (iOS) and Appium (Android)
 */
export class HomePage {
  private actions: BaseActions;

  constructor(actions: BaseActions) {
    this.actions = actions;
  }

  async isVisible(): Promise<void> {
    await this.actions.expectVisible(by.id("home-screen"));
  }

  async getWelcomeMessage(): Promise<string> {
    return await this.actions.getText(by.id("welcome-message"));
  }

  async navigateToProfile(): Promise<void> {
    await this.actions.click(by.id("profile-button"));
  }

  async logout(): Promise<void> {
    await this.actions.click(by.id("logout-button"));
    await this.actions.waitForElement(by.id("login-screen"), 10000);
  }
}
