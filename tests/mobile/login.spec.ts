import { describe, it, beforeAll, afterAll } from '@jest/globals';
import { ActionFactory } from '@framework/actions';
import { LoginPage } from '@applications/TestGround/pages/LoginPage';

// This test runs on:
// - iOS via Detox (default) or Appium (IOS_AUTOMATION_MODE=appium)
// - Android via Appium
// Platform is determined by TEST_PLATFORM environment variable
describe('Mobile Login Tests', () => {
  let loginPage: LoginPage;

  beforeAll(async () => {
    const platform = (process.env.TEST_PLATFORM || 'ios') as 'ios' | 'android';
    const actions = ActionFactory.create(platform);
    loginPage = new LoginPage(actions);
    // homePage = new HomePage(actions);
  });

  afterAll(async () => {
    // 清理 Appium session（仅 Appium 模式需要）
    const platform = process.env.TEST_PLATFORM || 'ios';
    const iosMode = process.env.IOS_AUTOMATION_MODE || 'detox';
    if (platform === 'android' || (platform === 'ios' && iosMode === 'appium')) {
      // AppiumActions.close() 会在 globalTeardown 中处理
    }
  });

  it.skip('should display login screen', async () => {
    await loginPage.isVisible();
  });

  it('should login successfully with valid credentials', async () => {
    await loginPage.login('admin', '123456');
    await loginPage.isVisible();
  });

  it.skip('should show error with invalid credentials', async () => {
    await loginPage.login('wronguser', 'wrongpass');
    await loginPage.expectLoginError('Invalid username or password');
  });
});
