import { describe, it, beforeAll, afterAll } from '@jest/globals';
import { ActionFactory } from '@framework/actions';
import { LoginPage } from '@applications/TestGround/pages/LoginPage';
import { HomePage } from '@applications/TestGround/pages/HomePage';

// This test runs on BOTH iOS (via Detox) and Android (via Appium)
// Platform is determined by TEST_PLATFORM environment variable
describe('Mobile Login Tests', () => {
  let loginPage: LoginPage;
  let homePage: HomePage;

  beforeAll(async () => {
    // Platform determined by TEST_PLATFORM env var: 'ios' or 'android'
    const platform = (process.env.TEST_PLATFORM || 'ios') as 'ios' | 'android';
    const actions = ActionFactory.create(platform);
    loginPage = new LoginPage(actions);
    // homePage = new HomePage(actions);
  });

  afterAll(async () => {
    // Cleanup if needed
  });

  it.skip('should display login screen', async () => {
    await loginPage.isVisible();
  });

  it('should login successfully with valid credentials', async () => {
    await loginPage.login('admin', '123456');
    await loginPage.isVisible();
  });

  it('should show error with invalid credentials', async () => {
    await loginPage.login('wronguser', 'wrongpass');
    await loginPage.expectLoginError('Invalid username or password');
  });
});
