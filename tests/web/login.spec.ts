import { test, expect } from '@playwright/test';
import { PlaywrightActions, ActionFactory } from '@framework/actions';

// Web tests can use PlaywrightActions directly or via ActionFactory
test.describe('Web Login Tests', () => {
  test('should login successfully with valid credentials (using ActionFactory)', async ({ page }) => {
    // Using ActionFactory for consistent API across platforms
    const actions = ActionFactory.createForWeb(page);
    await actions.navigateTo('https://yourapp.com');
    
    await actions.typeText('#username', 'testuser');
    await actions.typeText('#password', 'password123');
    await actions.click('#login-button');
    
    await actions.waitForElement('#home-screen', 10000);
    await expect(page).toHaveURL('/home');
  });

  test('should show error with invalid credentials (direct instantiation)', async ({ page }) => {
    // Direct instantiation also works
    const actions = new PlaywrightActions(page);
    await actions.navigateTo('https://yourapp.com');
    
    await actions.typeText('#username', 'wronguser');
    await actions.typeText('#password', 'wrongpass');
    await actions.click('#login-button');
    
    await actions.expectText('.error-message', 'Invalid credentials');
  });

  test('should demonstrate ActionFactory.create with config object', async ({ page, browser }) => {
    // Using ActionFactory.create with full config object
    const actions = ActionFactory.create({ 
      platform: 'web', 
      page,
      browser // optional
    });
    
    await actions.navigateTo('https://yourapp.com');
    await actions.expectVisible('#login-form');
  });
});
