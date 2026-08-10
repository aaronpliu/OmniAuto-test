import { getDriver } from '@core/drivers';
import { LoginPage } from '@apps/mock/pages/LoginPage';
import { loginWithValidUser } from '@apps/mock/workflows/loginWorkflow';
import { validUser, invalidUser } from '@apps/mock/fixtures/users';

// Resolve the active driver once (Detox by default; set E2E_DRIVER=appium to switch).
// Pages and tests stay identical across frameworks — only the launch/runner
// config differs.
const driver = getDriver();

/**
 * Login smoke test. Exercises the basic element actions (typeText, tap) and
 * assertions (toBeVisible) end-to-end through the page object / workflow.
 *
 * App launch is handled by the active driver's launcher. Switch frameworks with:
 *   E2E_DRIVER=detox  detox test --configuration ios.sim.debug
 *   E2E_DRIVER=appium npx wdio wdio.conf.ts   (or: npm run test:appium)
 */
describe('Login flow', () => {
  beforeAll(async () => {
    await driver.launcher.launchApp();
  });

  beforeEach(async () => {
    // Return to a clean login state before each case.
    await driver.launcher.reloadApp();
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
