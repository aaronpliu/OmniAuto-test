# Enhanced Wait Mechanisms in DetoxActions

## Overview

The `DetoxActions` class now includes comprehensive waiting strategies to handle element loading, visibility detection, and dynamic content. These mechanisms ensure your tests are robust and reliable when dealing with asynchronous UI updates.

## Why Wait Mechanisms Matter

In mobile app testing, elements don't always appear immediately:
- Network requests may be in progress
- Animations may be running
- Content may load dynamically
- User interactions trigger state changes

Without proper wait mechanisms, tests become flaky and unreliable.

---

## Available Wait Methods

### 1. **waitForElement()** - Basic Visibility Wait ⭐ Most Common

Waits for an element to be visible on screen.

```typescript
async waitForElement(selector: DetoxSelector, timeout = 10000): Promise<void>
```

**Usage:**
```typescript
// Wait for element by ID (default 10s timeout)
await actions.waitForElement('loginButton');

// Custom timeout
await actions.waitForElement('welcomeMessage', 5000);

// With custom matcher
await actions.waitForElement(DetoxActions.byText('Welcome'));
```

**When to use:**
- Standard element appearance after navigation
- After clicking a button that triggers a view change
- Default choice for most scenarios

---

### 2. **waitForElementToExist()** - Existence Wait

Waits for element to exist in the UI hierarchy (may not be visible).

```typescript
async waitForElementToExist(selector: DetoxSelector, timeout = 10000): Promise<void>
```

**Usage:**
```typescript
// Element exists but might be hidden
await actions.waitForElementToExist('hiddenModal');

// Useful for off-screen elements
await actions.waitForElementToExist(DetoxActions.byType('UITableViewCell'));
```

**When to use:**
- Elements that exist but are off-screen
- Pre-loaded content that's not yet visible
- Checking if element is in the DOM/hierarchy

---

### 3. **waitForElementWithRetry()** - Custom Polling Wait

Waits with custom polling interval and condition checking.

```typescript
async waitForElementWithRetry(
  selector: DetoxSelector,
  options: {
    timeout?: number;
    pollingInterval?: number;
    condition?: 'visible' | 'exist' | 'enabled';
  } = {}
): Promise<void>
```

**Usage:**
```typescript
// Wait for element to be enabled
await actions.waitForElementWithRetry('submitButton', {
  condition: 'enabled',
  timeout: 8000,
  pollingInterval: 300
});

// Wait for existence with fast polling
await actions.waitForElementWithRetry('dynamicContent', {
  condition: 'exist',
  pollingInterval: 100
});
```

**When to use:**
- Need fine-grained control over polling
- Waiting for specific state (enabled/disabled)
- Performance-critical scenarios

---

### 4. **waitForAllElements()** - Multiple Elements Wait

Waits for ALL elements to be visible.

```typescript
async waitForAllElements(selectors: DetoxSelector[], timeout = 10000): Promise<void>
```

**Usage:**
```typescript
// Wait for multiple elements
await actions.waitForAllElements([
  'header',
  'content',
  'footer'
]);

// With custom matchers
await actions.waitForAllElements([
  DetoxActions.byText('Title'),
  DetoxActions.byText('Subtitle'),
  DetoxActions.byId('button')
]);
```

**When to use:**
- Page load verification (all sections visible)
- Form completion checks
- Multi-element state validation

**Note:** Fails fast if any element doesn't appear.

---

### 5. **waitForAnyElement()** - First Match Wait

Waits for AT LEAST ONE element from a list to be visible.

```typescript
async waitForAnyElement(selectors: DetoxSelector[], timeout = 10000): Promise<number>
```

**Returns:** Index of the first visible element

**Usage:**
```typescript
// Wait for any error message to appear
const errorIndex = await actions.waitForAnyElement([
  'networkError',
  'validationError',
  'serverError'
]);

console.log(`Error type index: ${errorIndex}`);

// Wait for any variant of a button
await actions.waitForAnyElement([
  DetoxActions.byText('Continue'),
  DetoxActions.byText('Next'),
  DetoxActions.byText('Proceed')
]);
```

**When to use:**
- Multiple possible outcomes (success/error messages)
- A/B testing scenarios
- Dynamic UI with variable elements

---

### 6. **waitForElementToDisappear()** - Disappearance Wait

Waits for element to become NOT visible.

```typescript
async waitForElementToDisappear(selector: DetoxSelector, timeout = 5000): Promise<void>
```

**Usage:**
```typescript
// Wait for loading spinner to disappear
await actions.click('submit');
await actions.waitForElementToDisappear('loadingSpinner');

// Wait for modal to close
await actions.tap('closeButton');
await actions.waitForElementToDisappear('modalOverlay');
```

**When to use:**
- Loading indicators/spinners
- Modal/dialog dismissal
- Toast notifications disappearing
- Transient UI elements

---

### 7. **waitForText()** - Text Content Wait

Waits for specific text to appear in an element.

```typescript
async waitForText(selector: DetoxSelector, expectedText: string, timeout = 10000): Promise<void>
```

**Usage:**
```typescript
// Wait for dynamic text to load
await actions.waitForText('usernameDisplay', 'John Doe');

// Wait for API response text
await actions.waitForText('apiResponse', 'Success');

// Partial text match
await actions.waitForText('statusMessage', 'completed');
```

**When to use:**
- Dynamic content loading (user names, data)
- API response verification
- Status messages
- Real-time updates

---

### 8. **waitForElementToBeEnabled()** - Enabled State Wait

Waits for element to become enabled/interactive.

```typescript
async waitForElementToBeEnabled(selector: DetoxSelector, timeout = 10000): Promise<void>
```

**Usage:**
```typescript
// Fill form and wait for submit button to enable
await actions.typeText('email', 'user@example.com');
await actions.typeText('password', 'secret123');
await actions.waitForElementToBeEnabled('submitButton');
await actions.click('submitButton');

// Wait for button after validation
await actions.waitForElementToBeEnabled(DetoxActions.byText('Continue'));
```

**When to use:**
- Form validation (button enables when valid)
- Conditional UI elements
- Progressive disclosure patterns
- Agreement checkboxes enabling buttons

---

### 9. **waitForElementWhileScrolling()** - Scroll & Wait

Waits for element while scrolling through a container.

```typescript
async waitForElementWhileScrolling(
  targetSelector: DetoxSelector,
  scrollContainerSelector: DetoxSelector,
  direction: 'up' | 'down' | 'left' | 'right' = 'down',
  scrollAmount: number = 50,
  timeout = 15000
): Promise<void>
```

**Usage:**
```typescript
// Scroll down until finding an item
await actions.waitForElementWhileScrolling(
  DetoxActions.byText('Target Item'),
  DetoxActions.byType('UIScrollView'),
  'down',
  100
);

// Scroll up to find header
await actions.waitForElementWhileScrolling(
  'pageHeader',
  'scrollView',
  'up',
  200
);
```

**When to use:**
- Long lists/infinite scroll
- Finding items not initially visible
- Scroll-based navigation

**Note:** Current implementation waits for visibility. For advanced scroll-while-wait, consider manual scrolling loops.

---

## Practical Examples

### Example 1: Login Flow with Loading States

```typescript
async function testLoginFlow() {
  // Fill credentials
  await actions.typeText('emailInput', 'user@example.com');
  await actions.typeText('passwordInput', 'password123');
  
  // Submit form
  await actions.click('loginButton');
  
  // Wait for loading spinner to appear
  await actions.waitForElement('loadingSpinner', 3000);
  
  // Wait for spinner to disappear
  await actions.waitForElementToDisappear('loadingSpinner', 10000);
  
  // Wait for dashboard to load
  await actions.waitForAllElements([
    'dashboardHeader',
    'userProfile',
    'navigationMenu'
  ], 8000);
  
  console.log('✅ Login successful');
}
```

### Example 2: Handling Multiple Error Scenarios

```typescript
async function testFormValidation() {
  // Submit empty form
  await actions.click('submitButton');
  
  // Wait for any error message to appear
  const errorIndex = await actions.waitForAnyElement([
    'emailRequiredError',
    'passwordRequiredError',
    'generalError'
  ], 5000);
  
  // Handle based on which error appeared
  switch (errorIndex) {
    case 0:
      console.log('Email validation error shown');
      break;
    case 1:
      console.log('Password validation error shown');
      break;
    case 2:
      console.log('General error shown');
      break;
  }
}
```

### Example 3: Dynamic Content Loading

```typescript
async function testUserProfileLoad() {
  // Navigate to profile
  await actions.tap('profileTab');
  
  // Wait for username to load (dynamic from API)
  await actions.waitForText('usernameDisplay', 'Loading...', 2000);
  await actions.waitForText('usernameDisplay', 'John Doe', 10000);
  
  // Wait for avatar image to be visible
  await actions.waitForElement('userAvatar', 8000);
  
  // Wait for bio text to populate
  await actions.waitForElementToExist('userBio');
  
  console.log('✅ Profile loaded successfully');
}
```

### Example 4: Form with Conditional Button

```typescript
async function testConditionalForm() {
  // Fill required fields
  await actions.typeText('nameField', 'John Doe');
  await actions.typeText('emailField', 'john@example.com');
  
  // Button should still be disabled
  await actions.expectDisabled('submitButton');
  
  // Check terms checkbox
  await actions.tap('termsCheckbox');
  
  // Wait for button to become enabled
  await actions.waitForElementToBeEnabled('submitButton', 5000);
  
  // Now we can submit
  await actions.click('submitButton');
}
```

### Example 5: Infinite Scroll List

```typescript
async function testInfiniteScroll() {
  // Load initial items
  await actions.waitForElement('itemList');
  
  // Scroll to find specific item
  try {
    await actions.waitForElementWhileScrolling(
      DetoxActions.byText('Item #50'),
      DetoxActions.byType('UITableView'),
      'down',
      100,
      20000
    );
    
    console.log('✅ Found item #50');
  } catch (error) {
    console.log('❌ Item #50 not found after scrolling');
  }
}
```

---

## Best Practices

### ✅ DO:

1. **Use appropriate timeouts**
   ```typescript
   // Fast operations: 3-5 seconds
   await actions.waitForElement('quickToast', 3000);
   
   // Normal operations: 8-10 seconds
   await actions.waitForElement('dashboard', 10000);
   
   // Slow operations (API calls): 15-20 seconds
   await actions.waitForElement('reportData', 20000);
   ```

2. **Wait before interacting**
   ```typescript
   // ❌ BAD - May fail if element not ready
   await actions.click('dynamicButton');
   
   // ✅ GOOD - Wait first
   await actions.waitForElement('dynamicButton');
   await actions.click('dynamicButton');
   ```

3. **Use specific wait methods**
   ```typescript
   // For loading spinners
   await actions.waitForElementToDisappear('spinner');
   
   // For form validation
   await actions.waitForElementToBeEnabled('submitBtn');
   
   // For dynamic text
   await actions.waitForText('status', 'Complete');
   ```

4. **Combine waits for complex flows**
   ```typescript
   await actions.waitForElementToDisappear('loader');
   await actions.waitForAllElements(['header', 'content', 'footer']);
   await actions.waitForText('welcomeMessage', 'Hello');
   ```

### ❌ DON'T:

1. **Don't use sleep()**
   ```typescript
   // ❌ BAD - Unreliable and slow
   await new Promise(r => setTimeout(r, 5000));
   
   // ✅ GOOD - Smart waiting
   await actions.waitForElement('content', 5000);
   ```

2. **Don't use excessive timeouts**
   ```typescript
   // ❌ BAD - Too long, masks real issues
   await actions.waitForElement('button', 60000);
   
   // ✅ GOOD - Reasonable timeout
   await actions.waitForElement('button', 10000);
   ```

3. **Don't ignore failures**
   ```typescript
   // ❌ BAD - Silent failure
   try {
     await actions.waitForElement('optional');
   } catch (e) {
     // Ignored
   }
   
   // ✅ GOOD - Handle appropriately
   try {
     await actions.waitForElement('optional', 3000);
   } catch (e) {
     logger.warn('Optional element not found, continuing...');
   }
   ```

---

## Timeout Guidelines

| Scenario | Recommended Timeout |
|----------|-------------------|
| Quick UI updates (toasts, badges) | 2-3 seconds |
| Button clicks, navigation | 5-8 seconds |
| Page loads, screen transitions | 8-10 seconds |
| API calls, data fetching | 10-15 seconds |
| Complex operations, reports | 15-20 seconds |
| Slow network, large data | 20-30 seconds |

---

## Comparison with Other Methods

| Method | Use Case | Polling | Returns |
|--------|----------|---------|---------|
| `waitForElement()` | Standard visibility | Built-in | void |
| `waitForElementToExist()` | DOM presence | Built-in | void |
| `waitForElementWithRetry()` | Custom conditions | Configurable | void |
| `waitForAllElements()` | Multiple elements | Parallel | void |
| `waitForAnyElement()` | First match | Sequential | index |
| `waitForElementToDisappear()` | Element removal | Manual loop | void |
| `waitForText()` | Text content | Manual loop | void |
| `waitForElementToBeEnabled()` | Interactive state | Manual loop | void |

---

## Migration Guide

### From Simple Waits to Enhanced Waits

**Before:**
```typescript
// Basic wait only
await actions.waitForElement('content');
```

**After:**
```typescript
// Choose the right wait strategy
await actions.waitForElementToDisappear('loader');
await actions.waitForAllElements(['header', 'content']);
await actions.waitForText('status', 'Loaded');
```

### Replacing Sleep Calls

**Before:**
```typescript
await actions.click('submit');
await new Promise(r => setTimeout(r, 3000)); // Bad!
await actions.expectVisible('success');
```

**After:**
```typescript
await actions.click('submit');
await actions.waitForElementToDisappear('spinner', 5000);
await actions.waitForElement('success', 5000);
```

---

## Troubleshooting

### Issue: Timeout too short
**Symptom:** Tests fail intermittently with timeout errors
**Solution:** Increase timeout or investigate performance

```typescript
// Increase timeout
await actions.waitForElement('slowComponent', 15000);

// Or optimize the app/loading process
```

### Issue: Element never appears
**Symptom:** Consistent timeout failures
**Solution:** Check selector, verify element exists, add debugging

```typescript
// Add debug logging
logger.debug('Waiting for element...');
await actions.waitForElement('myElement');
logger.debug('Element found!');

// Verify selector is correct
const elem = DetoxActions.byId('myElement');
await actions.expectVisible(elem);
```

### Issue: Flaky tests
**Symptom:** Tests pass/fail randomly
**Solution:** Use more specific wait conditions

```typescript
// Instead of just visibility
await actions.waitForElement('button');

// Wait for specific state
await actions.waitForElementToBeEnabled('button');
await actions.waitForText('button', 'Submit');
```

---

## Summary

The enhanced wait mechanisms provide:

✅ **Reliability** - No more flaky tests due to timing issues  
✅ **Flexibility** - Multiple strategies for different scenarios  
✅ **Control** - Fine-tune timeouts and polling intervals  
✅ **Clarity** - Expressive method names show intent  
✅ **Performance** - Smart polling instead of blind sleeps  

Choose the right wait method for your scenario and make your tests rock-solid! 🚀
