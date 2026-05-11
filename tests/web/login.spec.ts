import { test, expect } from '@playwright/test';
import { PlaywrightActions } from '@framework/actions/PlaywrightActions';

// Web tests use Playwright's native test runner and PlaywrightActions directly
test.describe('Web Login Tests', () => {
  test('should login successfully with valid credentials', async ({ page }) => {
    const actions = new PlaywrightActions(page);
    await actions.navigateTo('https://yourapp.com');
    
    await actions.typeText('#username', 'testuser');
    await actions.typeText('#password', 'password123');
    await actions.click('#login-button');
    
    await actions.waitForElement('#home-screen', 10000);
    await expect(page).toHaveURL('/home');
  });

  test('should show error with invalid credentials', async ({ page }) => {
    const actions = new PlaywrightActions(page);
    await actions.navigateTo('https://yourapp.com');
    
    await actions.typeText('#username', 'wronguser');
    await actions.typeText('#password', 'wrongpass');
    await actions.click('#login-button');
    
    await actions.expectText('.error-message', 'Invalid credentials');
  });
});
