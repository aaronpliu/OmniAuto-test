import type { ILocator } from "@core/ILocator";

/**
 * Declarative locators for the login screen. These are driver-neutral
 * {@link ILocator}s resolved by the active driver's matcher factory. The `id`
 * field maps to Detox `by.id` / Appium `accessibility id`, so testIDs stay
 * identical across frameworks. Keep them in sync with the app's accessibility
 * identifiers.
 */
export const loginLocators = {
  /** Username / email text field. */
  username: { id: "usernameInput" } as ILocator,
  /** Password secure text field. */
  password: { id: "passwordInput" } as ILocator,
  /** Submit button. */
  submit: { id: "loginButton" } as ILocator,
  /** Inline error message shown on failed login. */
  error: { id: "login.error" } as ILocator,
  /** Welcome banner shown after a successful login (on the home screen). */
  welcome: { id: "home.welcome" } as ILocator,
  /** Optional promo banner (CMS-configured); may be absent. */
  promoBanner: { id: "home.promoBanner" } as ILocator,
};
