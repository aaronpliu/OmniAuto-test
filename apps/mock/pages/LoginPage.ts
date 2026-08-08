import type { IActions } from '@contracts/IActions';
import { DetoxMatcher } from '@adapters/detox';
import { Logger } from '@utils/logger';
import { loginLocators } from '../locators/login.locators';

const logger = Logger.getInstance();

/**
 * Page object for the login screen. Encapsulates element resolution and the
 * basic {@link IActions} interactions (type text, tap, assert visibility) so
 * test specs stay declarative and resilient to locator changes.
 */
export class LoginPage {
  /** Resolve the username field as a contract-compliant action. */
  async usernameField(): Promise<IActions> {
    return new DetoxMatcher(loginLocators.username).resolve();
  }

  /** Resolve the password field. */
  async passwordField(): Promise<IActions> {
    return new DetoxMatcher(loginLocators.password).resolve();
  }

  /** Resolve the submit button. */
  async submitButton(): Promise<IActions> {
    return new DetoxMatcher(loginLocators.submit).resolve();
  }

  /** Resolve the inline error message element. */
  async errorText(): Promise<IActions> {
    return new DetoxMatcher(loginLocators.error).resolve();
  }

  /** Resolve the post-login welcome banner. */
  async welcomeBanner(): Promise<IActions> {
    return new DetoxMatcher(loginLocators.welcome).resolve();
  }

  /**
   * Perform a login: type the credentials and tap submit.
   * Demonstrates the basic methods `typeText` and `tap`.
   */
  async login(username: string, password: string): Promise<void> {
    logger.info(`login attempt for user "${username}"`);
    const usernameField = await this.usernameField();
    await usernameField.typeText(username);

    const passwordField = await this.passwordField();
    await passwordField.typeText(password);

    const submit = await this.submitButton();
    await submit.tap();
  }

  /** Assert the welcome banner is visible after a successful login. */
  async expectWelcomeVisible(): Promise<void> {
    const welcome = await this.welcomeBanner();
    await welcome.toBeVisible();
  }

  /** Assert an inline error is shown after a failed login. */
  async expectErrorVisible(): Promise<void> {
    const error = await this.errorText();
    await error.toBeVisible();
  }
}
