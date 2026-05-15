/**
 * Web Actions Quick Reference (Playwright)
 * 
 * Quick guide to using ActionFactory and PlaywrightActions for web testing
 */

import { test } from '@playwright/test';
import { ActionFactory, PlaywrightActions } from '../framework/actions';

// ============================================
// QUICK REFERENCE: CREATING WEB ACTIONS
// ============================================

test.describe('Web Actions Examples', () => {
  
  // 1️⃣ USING ACTIONFACTORY.CREATEFORWEB (Recommended)
  test('using createForWeb helper', async ({ page }) => {
    const actions = ActionFactory.createForWeb(page);
    await actions.navigateTo('https://example.com');
  });

  // 2️⃣ USING ACTIONFACTORY.CREATE WITH CONFIG
  test('using create with config object', async ({ page, browser }) => {
    const actions = ActionFactory.create({
      platform: 'web',
      page,
      browser // optional
    });
    await actions.navigateTo('https://example.com');
  });

  // 3️⃣ DIRECT INSTANTIATION (Also valid)
  test('using direct instantiation', async ({ page }) => {
    const actions = new PlaywrightActions(page);
    await actions.navigateTo('https://example.com');
  });

  // ============================================
  // COMMON PATTERNS
  // ============================================

  test('basic interactions', async ({ page }) => {
    const actions = ActionFactory.createForWeb(page);
    
    // Navigation
    await actions.navigateTo('https://yourapp.com');
    
    // Input
    await actions.typeText('#username', 'testuser');
    await actions.typeText('#password', 'secret123');
    
    // Click
    await actions.click('#login-button');
    
    // Assertions
    await actions.waitForElement('#dashboard');
    await actions.expectVisible('#welcome-message');
    await actions.expectText('#user-name', 'Test User');
  });

  test('advanced interactions', async ({ page }) => {
    const actions = ActionFactory.createForWeb(page);
    
    // Double click
    await actions.doubleClick('.item');
    
    // Long press simulation
    await actions.longPress('.menu-item', 1500);
    
    // Get text
    const title = await actions.getText('h1');
    console.log('Page title:', title);
    
    // Check enabled/disabled
    await actions.expectEnabled('#submit-btn');
    await actions.expectDisabled('#cancel-btn');
  });

  test('gestures and scrolling', async ({ page }) => {
    const actions = ActionFactory.createForWeb(page);
    
    // Swipe (simulated with mouse)
    await actions.swipe('up', 200);
    await actions.swipe('down', 100);
    
    // Scroll to element
    await actions.scroll('#footer');
    
    // Pinch zoom simulation
    await actions.pinch(1.5);
  });

  test('device emulation', async ({ page }) => {
    const actions = ActionFactory.createForWeb(page);
    
    // Set orientation
    await actions.setOrientation('landscape');
    
    // Set geolocation (requires permission)
    await actions.setLocation(37.7749, -122.4194); // San Francisco
    
    // Take screenshot
    const path = await actions.takeScreenshot('dashboard');
    console.log('Screenshot saved to:', path);
  });

  test('navigation controls', async ({ page }) => {
    const actions = ActionFactory.createForWeb(page);
    
    await actions.navigateTo('https://example.com/page1');
    await actions.navigateTo('https://example.com/page2');
    
    // Go back
    await actions.back();
    
    // Reload
    await actions.reload();
    
    // Close browser
    // await actions.close(); // Usually not needed in tests
  });

  // ============================================
  // ALL AVAILABLE METHODS (Signature Reference)
  // ============================================

  /*
  // Navigation
  await actions.navigateTo(url?: string);
  
  // Interactions
  await actions.click(selector: string);
  await actions.doubleClick(selector: string);
  await actions.longPress(selector: string, duration?: number);
  
  // Input
  await actions.typeText(selector: string, text: string);
  await actions.clearText(selector: string);
  const text = await actions.getText(selector: string);
  
  // Assertions
  await actions.waitForElement(selector: string, timeout?: number);
  await actions.expectVisible(selector: string);
  await actions.expectNotVisible(selector: string);
  await actions.expectText(selector: string, text: string);
  await actions.expectContainsText(selector: string, text: string);
  await actions.expectEnabled(selector: string);
  await actions.expectDisabled(selector: string);
  
  // Gestures
  await actions.swipe(direction: 'up' | 'down' | 'left' | 'right', distance?: number);
  await actions.scroll(toSelector: string);
  await actions.pinch(scale: number);
  
  // Utilities
  const path = await actions.takeScreenshot(name: string);
  await actions.reload();
  await actions.back();
  await actions.close();
  
  // Device
  await actions.setOrientation(orientation: 'portrait' | 'landscape');
  await actions.setLocation(latitude: number, longitude: number);
  */

  // ============================================
  // CROSS-PLATFORM CONSISTENCY
  // ============================================

  test('same code works across platforms', async ({ page }) => {
    // This same test structure can be used for mobile!
    // Just change how you create the actions:
    
    // For Web:
    const webActions = ActionFactory.createForWeb(page);
    
    // For iOS:
    // const iosActions = ActionFactory.createForMobile('ios');
    
    // For Android:
    // const androidActions = ActionFactory.createForMobile('android');
    
    // Then use the same methods:
    await webActions.navigateTo('https://example.com');
    await webActions.typeText('#email', 'user@example.com');
    await webActions.click('#submit');
    await webActions.expectVisible('#success');
  });
});

// ============================================
// WHEN TO USE WHAT
// ============================================

/*
PREFER ActionFactory?
  → Use when you want consistent API across web/mobile
  → Use ActionFactory.createForWeb(page) for simplicity
  → Use ActionFactory.create({ platform: 'web', page }) for full control

PREFER Direct Instantiation?
  → Use when you only test web
  → Simpler: new PlaywrightActions(page)
  → No factory overhead

NEED Browser object?
  → Pass it as second parameter: ActionFactory.createForWeb(page, browser)
  → Or in config: { platform: 'web', page, browser }
*/
