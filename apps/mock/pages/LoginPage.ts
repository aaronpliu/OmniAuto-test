import { Logger } from "@utils/logger";
import { BasePage } from "@core/index";
import { loginLocators } from "../locators/login.locators";

const logger = Logger.getInstance();

/**
 * Page object for the login screen.
 *
 * Element resolution (`find` / `locate`) is inherited from {@link BasePage},
 * which delegates to the active driver's matcher factory (Detox by default,
 * Appium later). The underlying `element(by.id()).tap()` mechanics live inside
 * the adapter, not here. Callers compose resolved actions with a single
 * `await`:
 *
 * ```ts
 * await page.find(loginLocators.username).typeText(user);
 * await page.find(loginLocators.submit).tap();
 * ```
 */
export class LoginPage extends BasePage {
  /**
   * Perform a login: type the credentials and tap submit.
   * Demonstrates the basic methods `typeText` and `tap`.
   */
  async login(username: string, password: string): Promise<void> {
    logger.info(`login attempt for user "${username}"`);
    await this.find(loginLocators.username).typeText(username);
    await this.find(loginLocators.password).typeText(password);
    await this.find(loginLocators.submit).tap();
  }

  /** Assert the welcome banner is visible after a successful login. */
  async expectWelcomeVisible(): Promise<void> {
    await this.find(loginLocators.welcome).toBeVisible();
  }

  /** Assert an inline error is shown after a failed login. */
  async expectErrorVisible(): Promise<void> {
    await this.find(loginLocators.error).toBeVisible();
  }

  /**
   * Dismiss the optional promo banner if it is present. The banner is
   * CMS-configured, so it may be absent — use `tapIfExists` so a missing
   * banner never fails the suite. Returns whether the banner was dismissed.
   */
  async dismissPromoIfPresent(): Promise<boolean> {
    return this.find(loginLocators.promoBanner).tapIfExists();
  }
}
