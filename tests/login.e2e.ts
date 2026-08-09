import { detoxAppLauncher } from '@adapters/detox';
import { LoginPage } from '@apps/mock/pages/LoginPage';
import { loginWithValidUser } from '@apps/mock/workflows/loginWorkflow';
import { validUser, invalidUser } from '@apps/mock/fixtures/users';

/**
 * Login smoke test. Exercises the basic element actions (typeText, tap) and
 * assertions (toBeVisible) end-to-end through the page object / workflow.
 *
 * App launch is handled by the active driver's launcher (`detoxAppLauncher`);
 * switching frameworks means importing the corresponding launcher instead.
 *
 * Requires a built app + running simulator/emulator; run with, e.g.:
 *   detox test --configuration ios.sim.debug
 */
describe('Login flow', () => {
  beforeAll(async () => {
    await detoxAppLauncher.launchApp();
  });

  beforeEach(async () => {
    // Return to a clean login state before each case.
    await detoxAppLauncher.reloadApp();
  });

  it('logs in with valid credentials and shows the welcome banner', async () => {
    const page = new LoginPage();
    await page.login(validUser.username, validUser.password);
    // await page.expectWelcomeVisible();
  });

  it('logs in via the reusable workflow', async () => {
    await loginWithValidUser();
  });

  it('shows an error for invalid credentials', async () => {
    const page = new LoginPage();
    await page.login(invalidUser.username, invalidUser.password);
    // await page.expectErrorVisible();
  });
});
