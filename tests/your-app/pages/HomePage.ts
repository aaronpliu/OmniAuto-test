import { BaseActions } from "@omnitest/core/actions/BaseActions";

export class HomePage {
  private actions: BaseActions;

  constructor(actions: BaseActions) {
    this.actions = actions;
  }

  async isVisible(): Promise<void> {
    await this.actions.expectVisible("home-screen");
  }

  async getWelcomeMessage(): Promise<string> {
    return await this.actions.getText("welcome-message");
  }

  async navigateToProfile(): Promise<void> {
    await this.actions.click("profile-button");
  }

  async logout(): Promise<void> {
    await this.actions.click("logout-button");
    await this.actions.waitForElement("login-screen", 10000);
  }
}
