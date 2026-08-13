import { LoginPage } from "../pages/LoginPage";
import { validUser, type UserCredentials } from "../fixtures/users";

/**
 * High-level login workflow combining page-object steps into a single,
 * reusable business action. Tests call `loginWithValidUser()` rather than
 * touching page internals.
 */
export async function login(user: UserCredentials = validUser): Promise<void> {
  const page = new LoginPage();
  await page.login(user.username, user.password);
  await page.expectWelcomeVisible();
}

/** Convenience wrapper using the default valid test user. */
export async function loginWithValidUser(): Promise<void> {
  await login(validUser);
}
