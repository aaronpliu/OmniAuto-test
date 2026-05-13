/**
 * Wait Methods Quick Reference
 * 
 * Quick guide to choosing the right wait strategy in DetoxActions
 */

import { DetoxActions } from '../framework/actions/DetoxActions';

const actions = new DetoxActions();

// ============================================
// QUICK DECISION GUIDE
// ============================================

/*
What are you waiting for?

┌─────────────────────────────────────┬──────────────────────────────────┐
│ Scenario                            │ Method                           │
├─────────────────────────────────────┼──────────────────────────────────┤
│ Element to appear on screen         │ waitForElement()                 │
│ Element to exist (may be hidden)    │ waitForElementToExist()          │
│ Element to disappear                │ waitForElementToDisappear()      │
│ Specific text to load               │ waitForText()                    │
│ Button/element to become enabled    │ waitForElementToBeEnabled()      │
│ Multiple elements to all appear     │ waitForAllElements()             │
│ Any one of several elements         │ waitForAnyElement()              │
│ Custom condition with polling       │ waitForElementWithRetry()        │
│ Element while scrolling list        │ waitForElementWhileScrolling()   │
└─────────────────────────────────────┴──────────────────────────────────┘
*/

// ============================================
// COMMON PATTERNS
// ============================================

// 1️⃣ WAIT FOR PAGE LOAD
async function waitForPageLoad() {
  // Wait for main sections
  await actions.waitForAllElements([
    'header',
    'content',
    'footer'
  ]);
}

// 2️⃣ WAIT FOR LOADING STATE
async function waitForLoadingComplete() {
  // Show loading
  await actions.click('submit');
  
  // Wait for spinner
  await actions.waitForElement('loadingSpinner', 3000);
  
  // Wait for spinner to disappear
  await actions.waitForElementToDisappear('loadingSpinner', 10000);
  
  // Wait for result
  await actions.waitForElement('result');
}

// 3️⃣ WAIT FOR FORM VALIDATION
async function waitForFormReady() {
  // Fill form
  await actions.typeText('email', 'user@test.com');
  await actions.typeText('password', 'secret');
  
  // Wait for submit button to enable
  await actions.waitForElementToBeEnabled('submitButton');
  
  // Submit
  await actions.click('submitButton');
}

// 4️⃣ WAIT FOR DYNAMIC CONTENT
async function waitForDynamicData() {
  // Wait for loading text
  await actions.waitForText('status', 'Loading...');
  
  // Wait for actual data
  await actions.waitForText('username', 'John Doe', 10000);
  
  // Verify element visible
  await actions.waitForElement('userProfile');
}

// 5️⃣ HANDLE MULTIPLE OUTCOMES
async function handleMultipleOutcomes() {
  // Trigger action
  await actions.click('process');
  
  // Wait for any outcome
  const outcomeIndex = await actions.waitForAnyElement([
    'successMessage',
    'errorMessage',
    'warningMessage'
  ], 10000);
  
  // Handle based on outcome
  if (outcomeIndex === 0) {
    console.log('Success!');
  } else if (outcomeIndex === 1) {
    console.log('Error occurred');
  } else {
    console.log('Warning shown');
  }
}

// 6️⃣ SCROLL TO FIND ELEMENT
async function scrollToFindItem() {
  // Scroll down until finding item
  await actions.waitForElementWhileScrolling(
    DetoxActions.byText('Target Item'),
    DetoxActions.byType('UIScrollView'),
    'down',
    100,
    15000
  );
}

// 7️⃣ CUSTOM WAIT WITH RETRY
async function customWaitExample() {
  // Wait with custom settings
  await actions.waitForElementWithRetry('dynamicElement', {
    condition: 'visible',
    timeout: 8000,
    pollingInterval: 200
  });
}

// ============================================
// TIMEOUT RECOMMENDATIONS
// ============================================

/*
Quick UI updates:        2-3 seconds    (toasts, badges, animations)
Button clicks/nav:       5-8 seconds    (standard interactions)
Page loads:              8-10 seconds   (screen transitions)
API calls:               10-15 seconds  (data fetching)
Complex operations:      15-20 seconds  (reports, exports)
Slow network/large data: 20-30 seconds  (edge cases)
*/

// ============================================
// METHOD SIGNATURES REFERENCE
// ============================================

/*
// Basic visibility wait
await actions.waitForElement(
  selector: DetoxSelector,
  timeout?: number  // default: 10000
): Promise<void>

// Existence wait (may not be visible)
await actions.waitForElementToExist(
  selector: DetoxSelector,
  timeout?: number  // default: 10000
): Promise<void>

// Custom retry wait
await actions.waitForElementWithRetry(
  selector: DetoxSelector,
  options?: {
    timeout?: number;           // default: 10000
    pollingInterval?: number;   // default: 500
    condition?: 'visible' | 'exist' | 'enabled';  // default: 'visible'
  }
): Promise<void>

// Wait for all elements
await actions.waitForAllElements(
  selectors: DetoxSelector[],
  timeout?: number  // default: 10000
): Promise<void>

// Wait for any element (returns index)
await actions.waitForAnyElement(
  selectors: DetoxSelector[],
  timeout?: number  // default: 10000
): Promise<number>

// Wait for disappearance
await actions.waitForElementToDisappear(
  selector: DetoxSelector,
  timeout?: number  // default: 5000
): Promise<void>

// Wait for specific text
await actions.waitForText(
  selector: DetoxSelector,
  expectedText: string,
  timeout?: number  // default: 10000
): Promise<void>

// Wait for enabled state
await actions.waitForElementToBeEnabled(
  selector: DetoxSelector,
  timeout?: number  // default: 10000
): Promise<void>

// Wait while scrolling
await actions.waitForElementWhileScrolling(
  targetSelector: DetoxSelector,
  scrollContainerSelector: DetoxSelector,
  direction?: 'up' | 'down' | 'left' | 'right',  // default: 'down'
  scrollAmount?: number,  // default: 50
  timeout?: number  // default: 15000
): Promise<void>
*/

// ============================================
// SELECTOR TYPES
// ============================================

/*
type DetoxSelector = string | ReturnType<typeof element>;

// String → uses by.id() automatically
await actions.waitForElement('myButton');

// Custom matcher
await actions.waitForElement(DetoxActions.byText('Submit'));
await actions.waitForElement(element(by.label('Menu')));
*/

// ============================================
// ANTI-PATTERNS TO AVOID
// ============================================

/*
❌ DON'T use sleep():
  await new Promise(r => setTimeout(r, 5000));

✅ DO use smart waits:
  await actions.waitForElement('content', 5000);


❌ DON'T use excessive timeouts:
  await actions.waitForElement('button', 60000);

✅ DO use reasonable timeouts:
  await actions.waitForElement('button', 10000);


❌ DON'T ignore failures silently:
  try {
    await actions.waitForElement('optional');
  } catch (e) {}

✅ DO handle appropriately:
  try {
    await actions.waitForElement('optional', 3000);
  } catch (e) {
    logger.warn('Optional element not found');
  }
*/

// ============================================
// COMPLETE EXAMPLE
// ============================================

async function completeLoginFlowExample() {
  console.log('🚀 Starting login flow test...\n');
  
  // 1. Enter credentials
  console.log('1️⃣ Entering credentials...');
  await actions.typeText('emailInput', 'user@example.com');
  await actions.typeText('passwordInput', 'password123');
  
  // 2. Submit form
  console.log('2️⃣ Submitting form...');
  await actions.click('loginButton');
  
  // 3. Wait for loading state
  console.log('3️⃣ Waiting for loading...');
  await actions.waitForElement('loadingSpinner', 3000);
  console.log('   ✓ Loading spinner appeared');
  
  // 4. Wait for loading to complete
  console.log('4️⃣ Waiting for load completion...');
  await actions.waitForElementToDisappear('loadingSpinner', 10000);
  console.log('   ✓ Loading complete');
  
  // 5. Wait for dashboard to load
  console.log('5️⃣ Waiting for dashboard...');
  await actions.waitForAllElements([
    'dashboardHeader',
    'userProfile',
    'navigationMenu'
  ], 8000);
  console.log('   ✓ Dashboard loaded');
  
  // 6. Verify welcome message
  console.log('6️⃣ Verifying welcome message...');
  await actions.waitForText('welcomeMessage', 'Welcome', 5000);
  console.log('   ✓ Welcome message displayed');
  
  console.log('\n✅ Login flow test PASSED!');
}

export {
  completeLoginFlowExample,
  waitForPageLoad,
  waitForLoadingComplete,
  waitForFormReady,
  waitForDynamicData,
  handleMultipleOutcomes,
  scrollToFindItem,
  customWaitExample,
};
