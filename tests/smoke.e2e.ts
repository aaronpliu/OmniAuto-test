/**
 * Smoke suite — runs identically under Detox (Jest) and Appium (Mocha/wdio).
 *
 * The smoke reporter is framework-agnostic: it does not depend on Jest's or
 * wdio's reporter API, so the same summary is produced on either runner.
 * Pick the driver with E2E_DRIVER (detox default / appium), e.g.:
 *
 *   detox test --configuration ios.sim.release   (Jest)
 *   npm run test:appium                         (Mocha + wdio)
 *
 * The reporter writes a JSON artifact to reports/ when REPORT_DIR is set:
 *   REPORT_DIR=reports E2E_DRIVER=appium npx wdio wdio.conf.ts
 */
import { getDriver } from '@core/index';
import { SmokeReporter, runSmoke } from '@utils/SmokeReporter';
import { LoginPage } from '@apps/mock/pages/LoginPage';
import { loginLocators } from '@apps/mock/locators/login.locators';
import { env } from '@configs/env';

const reporter = new SmokeReporter({
  reportDir: env.REPORT_DIR, // optional; writes reports/<name>-<ts>.json
  reportName: `smoke-${env.E2E_DRIVER}`,
});

describe('smoke', () => {
  let page: LoginPage;

  beforeAll(() => {
    page = new LoginPage();
  });

  it('app launches and the promo banner can be dismissed', async () => {
    await runSmoke('app-launch', async () => {
      await getDriver().launcher.launchApp();
    }, reporter);

    await runSmoke('promo-dismiss', async () => {
      await page.dismissPromoIfPresent();
    }, reporter);

    await runSmoke('login-screen-visible', async () => {
      await page.locate(loginLocators.username).toBeVisible();
    }, reporter);

    const summary = await reporter.finish();
    // Surface the failure to the runner so the test still fails on smoke errors.
    if (!summary.success) {
      throw new Error(`Smoke failed: ${summary.failed} case(s) failed`);
    }
  });
});
