import type { ElementLocator } from '@adapters/detox';

/**
 * Declarative locators for the login screen. These map 1:1 onto Detox `by`
 * matchers via {@link DetoxMatcher}. Keep testIDs in sync with the app's
 * accessibility identifiers.
 */
export const loginLocators = {
  /** Username / email text field. */
  username: { id: 'login.username' } as ElementLocator,
  /** Password secure text field. */
  password: { id: 'login.password' } as ElementLocator,
  /** Submit button. */
  submit: { id: 'login.submit' } as ElementLocator,
  /** Inline error message shown on failed login. */
  error: { id: 'login.error' } as ElementLocator,
  /** Welcome banner shown after a successful login (on the home screen). */
  welcome: { id: 'home.welcome' } as ElementLocator,
};
