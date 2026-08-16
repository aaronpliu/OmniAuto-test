import type { ILocator } from "@core/ILocator";
import { byId, byText, allOf } from "@core/ILocator";

/**
 * Declarative locators for the login screen. These are driver-neutral
 * {@link ILocator}s resolved by the active driver's matcher factory. The `id`
 * strategy maps to Detox `by.id` / Appium `accessibility id`, so testIDs stay
 * identical across frameworks. Keep them in sync with the app's accessibility
 * identifiers.
 */
export const loginLocators = {
  /** Username / email text field. */
  username: byId("usernameInput"),
  /** Password secure text field. */
  password: byId("passwordInput"),
  /** Submit button. */
  submit: byId("loginButton"),
  /** Inline error message shown on failed login. */
  error: byId("login.error"),
  /** Welcome banner shown after a successful login (on the home screen). */
  welcome: byId("home.welcome"),
  /** Optional promo banner (CMS-configured); may be absent. */
  promoBanner: byId("home.promoBanner"),

  /**
   * Composite example: submit button narrowed by both id AND visible text.
   * Detox ⇒ by.id("loginButton").and(by.text("Sign in")); Appium ⇒ combined
   * selector. Composites keep multi-condition matching in the neutral model.
   */
  submitByText: allOf(byId("loginButton"), byText("Sign in")),
} satisfies Record<string, ILocator>;
