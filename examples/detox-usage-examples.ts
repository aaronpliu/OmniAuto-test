/**
 * DetoxActions Usage Examples
 * 
 * This file demonstrates how to use the enhanced DetoxActions with flexible selector strategies.
 */

import { by } from 'detox';
import { DetoxActions } from '../framework/actions/DetoxActions';

// Initialize DetoxActions
const actions = new DetoxActions();

// ============================================
// METHOD 1: Using String Selectors (Backward Compatible)
// Automatically uses by.id() for string selectors
// ============================================

async function exampleWithStringSelectors() {
  // Click an element by its testID
  await actions.click('loginButton');
  
  // Type text into an input field by testID
  await actions.typeText('usernameInput', 'john.doe');
  
  // Wait for an element to be visible
  await actions.waitForElement('welcomeMessage', 5000);
  
  // Assert element is visible
  await actions.expectVisible('dashboard');
}

// ============================================
// METHOD 2: Using Static Helper Methods
// Use DetoxActions static methods to create matchers
// ============================================

async function exampleWithStaticHelpers() {
  // Match by text content
  const submitButton = DetoxActions.byText('Submit');
  await actions.click(submitButton);
  
  // Match by accessibility label
  const menuButton = DetoxActions.byLabel('Open Menu');
  await actions.click(menuButton);
  
  // Match by native type
  const scrollView = DetoxActions.byType('UIScrollView');
  await actions.scroll(scrollView);
  
  // Match by test ID using helper
  const loginBtn = DetoxActions.byId('loginButton');
  await actions.click(loginBtn);
}

// ============================================
// METHOD 3: Using Direct Detox Matchers
// Pass Detox element matchers directly for maximum flexibility
// ============================================

async function exampleWithDirectMatchers() {
  // Match by text with regex
  await actions.click(element(by.text(/Submit \d+/)));
  
  // Match by label with regex
  await actions.expectVisible(element(by.label(/Welcome.*/)));
  
  // Combine matchers using .and()
  const specificButton = element(by.text('Submit').and(by.id('submitButton')));
  await actions.click(specificButton);
  
  // Match with ancestor
  const nestedElement = element(by.id('child').withAncestor(by.id('parent')));
  await actions.expectVisible(nestedElement);
  
  // Match with descendant
  const parentWithChild = element(by.id('parent').withDescendant(by.id('child')));
  await actions.expectVisible(parentWithChild);
}

// ============================================
// METHOD 4: Using byAll() for Complex Queries
// Combine multiple matchers with AND logic
// ============================================

async function exampleWithByAll() {
  // Find element that matches BOTH id='button' AND text='Submit'
  const submitBtn = DetoxActions.byAll(
    by.id('button'),
    by.text('Submit')
  );
  await actions.click(submitBtn);
  
  // Find element matching id, text, AND label
  const complexElement = DetoxActions.byAll(
    by.id('input'),
    by.label('Username'),
    by.type('UITextField')
  );
  await actions.typeText(complexElement, 'testuser');
}

// ============================================
// PRACTICAL EXAMPLES
// ============================================

async function practicalExample1_LoginForm() {
  // Scenario: Login form where elements don't have testIDs
  
  // Method 1: Match by placeholder text
  const emailInput = element(by.text('Enter your email'));
  await actions.typeText(emailInput, 'user@example.com');
  
  // Method 2: Match by accessibility label
  const passwordInput = DetoxActions.byLabel('Password field');
  await actions.typeText(passwordInput, 'secret123');
  
  // Method 3: Match button by text
  const loginButton = DetoxActions.byText('Login');
  await actions.click(loginButton);
  
  // Verify login success
  await actions.expectContainsText('welcomeMessage', 'Welcome');
}

async function practicalExample2_ListScrolling() {
  // Scenario: Scroll through a list and tap a specific item
  
  // Scroll to bottom of list
  const list = DetoxActions.byType('UITableView');
  await actions.scroll(list);
  
  // Find and click item by text
  const targetItem = DetoxActions.byText('Target Item Name');
  await actions.click(targetItem);
  
  // Verify item details are visible
  await actions.expectVisible(element(by.label('Item Details')));
}

async function practicalExample3_FormValidation() {
  // Scenario: Test form validation states
  
  // Fill form
  await actions.typeText('nameField', 'John');
  await actions.typeText('emailField', 'invalid-email');
  
  // Submit form
  await actions.click(DetoxActions.byText('Submit'));
  
  // Wait for error message
  await actions.waitForElement(element(by.text('Invalid email format')), 3000);
  
  // Verify error state
  await actions.expectVisible(element(by.text('Invalid email format')));
  
  // Fix email
  await actions.clearText('emailField');
  await actions.typeText('emailField', 'john@example.com');
  
  // Resubmit
  await actions.click(DetoxActions.byText('Submit'));
  
  // Verify success
  await actions.expectNotVisible(element(by.text('Invalid email format')));
}

async function practicalExample4_Gestures() {
  // Scenario: Test swipe gestures
  
  // Swipe up to refresh
  await actions.swipe('up');
  
  // Pinch to zoom out
  await actions.pinch(0.5, 'slow', 0);
  
  // Long press on an item
  const listItem = DetoxActions.byText('Important Item');
  await actions.longPress(listItem, 1500);
  
  // Verify context menu appears
  await actions.expectVisible(element(by.label('Context Menu')));
}

// ============================================
// TIPS AND BEST PRACTICES
// ============================================

/*
1. PREFER TEST IDs WHEN AVAILABLE:
   - Use string selectors or DetoxActions.byId() for elements with testID
   - Most reliable and fastest matching method
   
2. USE TEXT/LABEL FOR DYNAMIC CONTENT:
   - When testIDs aren't available, use byText() or byLabel()
   - Good for buttons, labels, and user-facing text
   
3. COMBINE MATCHERS FOR PRECISION:
   - Use byAll() or .and() to narrow down matches
   - Prevents matching multiple elements accidentally
   
4. USE TYPE FOR GENERIC ELEMENTS:
   - Good for scroll views, lists, and standard UI components
   - Platform-specific: use semantic types when possible
   
5. HANDLE ASYNC OPERATIONS:
   - Always await async methods
   - Use waitForElement() before interacting with dynamic content
   
6. ERROR HANDLING:
   - Methods throw descriptive errors when assertions fail
   - Use try-catch blocks for custom error handling
*/

export {
  exampleWithStringSelectors,
  exampleWithStaticHelpers,
  exampleWithDirectMatchers,
  exampleWithByAll,
  practicalExample1_LoginForm,
  practicalExample2_ListScrolling,
  practicalExample3_FormValidation,
  practicalExample4_Gestures,
};
