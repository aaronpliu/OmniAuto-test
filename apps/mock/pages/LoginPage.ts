import type { IActions } from '@contracts/IActions';
import type { ElementLocator } from '@adapters/detox';
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
  /** Resolve a locator into a contract-compliant action. */
  private resolve(locator: ElementLocator): Promise<IActions> {
    return new DetoxMatcher(locator).resolve();
  }

  /** Resolve the username field as a contract-compliant action. */
  usernameField(): Promise<IActions> {
    return this.resolve(loginLocators.username);
  }

  /** Resolve the password field. */
  passwordField(): Promise<IActions> {
    return this.resolve(loginLocators.password);
  }

  /** Resolve the submit button. */
  submitButton(): Promise<IActions> {
    return this.resolve(loginLocators.submit);
  }

  /** Resolve the inline error message element. */
  errorText(): Promise<IActions> {
    return this.resolve(loginLocators.error);
  }

  /** Resolve the post-login welcome banner. */
  welcomeBanner(): Promise<IActions> {
    return this.resolve(loginLocators.welcome);
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
