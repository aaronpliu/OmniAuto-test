/**
 * Advanced Cross-Platform Test Examples
 * 
 * Demonstrates how to write tests that work across platforms
 * while accessing platform-specific features when needed.
 */

import { describe, it, beforeAll } from '@jest/globals';
import { 
  ActionFactory, 
  isDetoxActions, 
  isAppiumActions,
  DetoxActions,
  AppiumActions,
  BaseActions
} from '@framework/actions';
import { HomePage } from '@applications/your-app/pages/HomePage';

describe('Advanced Cross-Platform Tests', () => {
  let actions: BaseActions;
  let homePage: HomePage;

  beforeAll(async () => {
    const platform = (process.env.TEST_PLATFORM || 'ios') as 'ios' | 'android';
    actions = ActionFactory.create(platform);
    homePage = new HomePage(actions);
  });

  /**
   * Example 1: Simple cross-platform test using string selectors
   * This runs identically on both iOS and Android
   */
  it('should display welcome message (cross-platform)', async () => {
    // Works on both platforms with simple string selector
    const message = await homePage.getWelcomeMessage();
    expect(message).toBeTruthy();
    expect(message).toContain('Welcome');
  });

  /**
   * Example 2: Using type guards for platform-specific behavior
   * Demonstrates accessing advanced features per platform
   */
  it('should handle complex elements (platform-specific)', async () => {
    if (isDetoxActions(actions)) {
      // iOS-specific: Use Detox's powerful matcher system
      console.log('Running iOS-specific test with Detox matchers');
      
      // Create complex selector using Detox static helpers
      const complexElement = DetoxActions.byAll(
        require('detox').by.id('welcome-text'),
        require('detox').by.text('Welcome')
      );
      
      // Can pass NativeElement directly to actions
      await actions.expectVisible(complexElement);
      
      // Access Detox-specific wait methods
      await actions.waitForElementWithRetry('profile-button', {
        timeout: 5000,
        condition: 'visible'
      });
      
    } else if (isAppiumActions(actions)) {
      // Android-specific: Use Appium's selector strategies
      console.log('Running Android-specific test with Appium selectors');
      
      // Could use XPath, UIAutomator, etc.
      // Note: Need to access driver through instance methods
      // This would require extending AppiumActions to expose driver
      
      // For now, use standard string selectors
      await actions.expectVisible('welcome-text');
      await actions.waitForElementToExist('profile-button', 5000);
    }
  });

  /**
   * Example 3: Conditional logic based on platform capabilities
   */
  it('should perform gestures (with platform adaptations)', async () => {
    // Basic swipe works on all platforms
    await actions.swipe('up', 100);
    
    // Platform-specific gesture handling
    if (isDetoxActions(actions)) {
      // Detox supports pinch with speed and angle parameters
      await actions.pinch(2.0); // Zoom in
      
      // Access Detox-specific methods
      await actions.waitForAllElements(['button1', 'button2'], 5000);
      
    } else if (isAppiumActions(actions)) {
      // Appium pinch implementation may differ
      await actions.pinch(2.0);
      
      // Access Appium-specific wait methods
      await actions.waitForAnyElement(['element1', 'element2'], 5000);
    }
  });

  /**
   * Example 4: Waiting strategies
   */
  it('should wait for dynamic content (advanced waits)', async () => {
    if (isDetoxActions(actions)) {
      // Detox: Use sophisticated wait strategies
      
      // Wait for element to disappear
      await actions.waitForElementToDisappear('loading-spinner', 5000);
      
      // Wait for specific text
      await actions.waitForText('welcome-text', 'Welcome', 10000);
      
      // Wait for element to be enabled
      await actions.waitForElementToBeEnabled('submit-button', 5000);
      
    } else if (isAppiumActions(actions)) {
      // Appium: Similar wait strategies available
      
      await actions.waitForElementToDisappear('loading-spinner', 5000);
      await actions.waitForText('welcome-text', 'Welcome', 10000);
      await actions.waitForElementToBeEnabled('submit-button', 5000);
    }
  });

  /**
   * Example 5: Screenshot and debugging
   */
  it('should capture screenshots for debugging', async () => {
    const screenshotPath = await actions.takeScreenshot('home-screen-test');
    console.log(`Screenshot saved to: ${screenshotPath}`);
    expect(screenshotPath).toBeTruthy();
  });
});

/**
 * Example 6: Page Object with Platform-Specific Selectors
 * 
 * This demonstrates how to design page objects that can leverage
 * platform-specific selector strategies while maintaining a common interface.
 */
describe('Page Object with Smart Selectors', () => {
  let actions: BaseActions;

  beforeAll(async () => {
    const platform = (process.env.TEST_PLATFORM || 'ios') as 'ios' | 'android';
    actions = ActionFactory.create(platform);
  });

  class SmartLoginPage {
    private actions: BaseActions;
    
    constructor(actions: BaseActions) {
      this.actions = actions;
    }

    /**
     * Login method that adapts to platform capabilities
     */
    async login(username: string, password: string): Promise<void> {
      // Common flow - works on all platforms
      await this.actions.typeText('username-field', username);
      await this.actions.typeText('password-field', password);
      await this.actions.click('login-button');
      
      // Platform-specific verification
      if (isDetoxActions(this.actions)) {
        // iOS: Can use more sophisticated assertions
        await this.actions.waitForElementWithRetry('home-screen', {
          timeout: 10000,
          condition: 'visible'
        });
      } else if (isAppiumActions(this.actions)) {
        // Android: Standard wait
        await this.actions.waitForElement('home-screen', 10000);
      }
    }

    /**
     * Platform-specific helper for complex scenarios
     */
    async handleBiometricLogin(): Promise<void> {
      if (isDetoxActions(this.actions)) {
        // iOS: Simulate FaceID/TouchID
        console.log('Simulating biometric login on iOS');
        // Would use Detox-specific biometric simulation
        // await device.simulateFaceIdMatch(); // Example
        
      } else if (isAppiumActions(this.actions)) {
        // Android: Different biometric approach
        console.log('Simulating biometric login on Android');
        // Would use Appium-specific biometric commands
      }
    }
  }

  it('should login with smart page object', async () => {
    const loginPage = new SmartLoginPage(actions);
    await loginPage.login('testuser', 'password123');
    
    // Verify successful login
    await actions.expectVisible('home-screen');
  });
});

/**
 * Example 7: Factory Pattern Best Practices
 */
describe('Factory Pattern Usage', () => {
  it('should demonstrate proper factory usage', async () => {
    // ✅ GOOD: Use factory for cross-platform tests
    const platform = (process.env.TEST_PLATFORM || 'ios') as 'ios' | 'android';
    const actions = ActionFactory.create(platform);
    
    // Work with base interface
    await actions.navigateTo();
    await actions.click('button');
    
    // Use type guards when needed
    if (isDetoxActions(actions)) {
      // TypeScript knows this is DetoxActions
      const detoxActions = actions; // No cast needed!
      // Can access DetoxActions-specific methods
    }
  });

  it('should avoid bad practices', async () => {
    const platform = (process.env.TEST_PLATFORM || 'ios') as 'ios' | 'android';
    const actions = ActionFactory.create(platform);
    
    // ❌ BAD: Don't cast without type guards
    // const detoxActions = actions as DetoxActions; // Unsafe!
    
    // ❌ BAD: Don't access private methods
    // const driver = (actions as any).driver; // Breaks encapsulation
    
    // ✅ GOOD: Use provided APIs and type guards
    if (isAppiumActions(actions)) {
      // Safe to use AppiumActions methods
      await actions.waitForElementToExist('element', 5000);
    }
  });
});
