# Wait Method Decision Tree

## Quick Decision Guide

```
What are you waiting for?
│
├─ Element to APPEAR on screen?
│  └─ ✅ waitForElement()
│
├─ Element to EXIST (may be hidden)?
│  └─ ✅ waitForElementToExist()
│
├─ Element to DISAPPEAR?
│  └─ ✅ waitForElementToDisappear()
│
├─ Specific TEXT to load?
│  └─ ✅ waitForText()
│
├─ Element to become ENABLED/CLICKABLE?
│  └─ ✅ waitForElementToBeEnabled()
│
├─ MULTIPLE elements to ALL appear?
│  └─ ✅ waitForAllElements()
│
├─ ANY ONE of several elements to appear?
│  └─ ✅ waitForAnyElement()
│
├─ Element while SCROLLING through list?
│  └─ ✅ waitForElementWhileScrolling()
│
└─ CUSTOM condition with specific polling?
   └─ ✅ waitForElementWithRetry()
```

---

## Detailed Decision Flow

### Scenario 1: Single Element Visibility

```
Is the element expected to be VISIBLE?
│
├─ YES → waitForElement()
│         │
│         ├─ Standard timeout (10s)? → waitForElement(selector)
│         └─ Custom timeout? → waitForElement(selector, 5000)
│
└─ NO (just needs to exist) → waitForElementToExist()
```

**Example:**
```typescript
// Button should be visible and clickable
await actions.waitForElement('submitBtn');

// Modal exists but might be off-screen
await actions.waitForElementToExist('modalContent');
```

---

### Scenario 2: Element Disappearance

```
Are you waiting for something to GO AWAY?
│
├─ Loading spinner? → waitForElementToDisappear('spinner')
├─ Modal closing? → waitForElementToDisappear('modal')
├─ Toast notification? → waitForElementToDisappear('toast', 3000)
└─ Progress bar? → waitForElementToDisappear('progressBar')
```

**Example:**
```typescript
await actions.click('submit');
await actions.waitForElement('loadingSpinner', 2000);
await actions.waitForElementToDisappear('loadingSpinner', 10000);
await actions.waitForElement('successMessage');
```

---

### Scenario 3: Dynamic Content

```
Is CONTENT changing dynamically?
│
├─ Waiting for specific TEXT? → waitForText()
│                                │
│                                ├─ User name? → waitForText('username', 'John Doe')
│                                ├─ Status message? → waitForText('status', 'Complete')
│                                └─ API response? → waitForText('response', 'Success')
│
└─ Waiting for element STATE? → waitForElementToBeEnabled()
                                 │
                                 ├─ Form button? → waitForElementToBeEnabled('submit')
                                 └─ Interactive element? → waitForElementToBeEnabled('btn')
```

**Example:**
```typescript
// Fill form
await actions.typeText('email', 'user@test.com');
await actions.typeText('password', 'secret');

// Wait for validation to enable button
await actions.waitForElementToBeEnabled('submitButton');

// Click and wait for response text
await actions.click('submit');
await actions.waitForText('responseMessage', 'Account created', 10000);
```

---

### Scenario 4: Multiple Elements

```
How MANY elements are you waiting for?
│
├─ ALL must appear? → waitForAllElements()
│                     │
│                     ├─ Page sections? → waitForAllElements(['header', 'content', 'footer'])
│                     ├─ Form fields? → waitForAllElements(['field1', 'field2', 'field3'])
│                     └─ Dashboard widgets? → waitForAllElements([widget1, widget2, widget3])
│
└─ ANY ONE can appear? → waitForAnyElement()
                          │
                          ├─ Error messages? → waitForAnyElement(['error1', 'error2', 'error3'])
                          ├─ Success variants? → waitForAnyElement(['msg1', 'msg2'])
                          └─ A/B test outcomes? → waitForAnyElement([variantA, variantB])
```

**Example:**
```typescript
// Wait for entire page to load
await actions.waitForAllElements([
  'navigationMenu',
  'pageHeader',
  'mainContent',
  'sidebar',
  'footer'
], 10000);

// Handle multiple error scenarios
const errorIndex = await actions.waitForAnyElement([
  'networkError',
  'validationError', 
  'timeoutError',
  'serverError'
], 8000);

console.log(`Error type: ${['network', 'validation', 'timeout', 'server'][errorIndex]}`);
```

---

### Scenario 5: Scrolling Lists

```
Do you need to SCROLL to find the element?
│
├─ YES → waitForElementWhileScrolling()
│         │
│         ├─ Scroll down? → waitForElementWhileScrolling(target, container, 'down')
│         ├─ Scroll up? → waitForElementWhileScrolling(target, container, 'up')
│         ├─ Custom amount? → waitForElementWhileScrolling(target, container, 'down', 100)
│         └─ Long timeout? → waitForElementWhileScrolling(target, container, 'down', 50, 20000)
│
└─ NO → Use regular waitForElement()
```

**Example:**
```typescript
// Find item in long list by scrolling
await actions.waitForElementWhileScrolling(
  DetoxActions.byText('Item #50'),    // Target
  DetoxActions.byType('UITableView'), // Scroll container
  'down',                              // Direction
  100,                                 // Scroll amount
  15000                                // Timeout
);
```

---

### Scenario 6: Custom Conditions

```
Do you need CUSTOM polling or conditions?
│
├─ YES → waitForElementWithRetry()
│         │
│         ├─ Check visibility? → waitForElementWithRetry(el, { condition: 'visible' })
│         ├─ Check existence? → waitForElementWithRetry(el, { condition: 'exist' })
│         ├─ Check enabled? → waitForElementWithRetry(el, { condition: 'enabled' })
│         ├─ Fast polling? → waitForElementWithRetry(el, { pollingInterval: 100 })
│         └─ Long timeout? → waitForElementWithRetry(el, { timeout: 20000 })
│
└─ NO → Use standard wait methods
```

**Example:**
```typescript
// Wait with custom settings
await actions.waitForElementWithRetry('dynamicButton', {
  condition: 'enabled',
  timeout: 8000,
  pollingInterval: 200
});

// Fast polling for quick updates
await actions.waitForElementWithRetry('badge', {
  condition: 'visible',
  timeout: 3000,
  pollingInterval: 50
});
```

---

## Common Test Flows

### Flow 1: Login with Loading State

```
1. Enter credentials
   └─ typeText('email', ...)
   └─ typeText('password', ...)

2. Submit form
   └─ click('loginButton')

3. Wait for loading
   └─ waitForElement('spinner', 3000)        ← Spinner appears

4. Wait for completion
   └─ waitForElementToDisappear('spinner')   ← Spinner disappears

5. Wait for dashboard
   └─ waitForAllElements(['header', 'content', 'menu'])

6. Verify welcome message
   └─ waitForText('welcome', 'Hello John')
```

---

### Flow 2: Form Validation

```
1. Fill partial form
   └─ typeText('email', 'test@test.com')

2. Button still disabled
   └─ expectDisabled('submitBtn')

3. Complete form
   └─ typeText('password', 'secret')
   └─ tap('termsCheckbox')

4. Wait for button to enable
   └─ waitForElementToBeEnabled('submitBtn')  ← Key wait!

5. Submit
   └─ click('submitBtn')

6. Wait for success/error
   └─ waitForAnyElement(['successMsg', 'errorMsg'])
```

---

### Flow 3: Data Loading

```
1. Navigate to page
   └─ tap('reportsTab')

2. Wait for loading indicator
   └─ waitForElement('loadingIndicator')

3. Wait for initial data
   └─ waitForText('status', 'Loading...')

4. Wait for data to populate
   └─ waitForText('reportTitle', 'Q4 Report', 15000)

5. Wait for all sections
   └─ waitForAllElements(['chart', 'table', 'summary'])

6. Verify complete
   └─ waitForElementToDisappear('loadingIndicator')
```

---

### Flow 4: Infinite Scroll

```
1. Load initial items
   └─ waitForElement('itemList')

2. Scroll to find target
   └─ waitForElementWhileScrolling(
        targetItem,
        scrollView,
        'down',
        100
      )

3. Verify item found
   └─ expectVisible(targetItem)

4. Interact with item
   └─ tap(targetItem)
```

---

## Timeout Selection Guide

```
How LONG should you wait?
│
├─ Quick UI updates (toasts, badges)
│  └─ 2-3 seconds
│
├─ Button clicks, navigation
│  └─ 5-8 seconds
│
├─ Page loads, transitions
│  └─ 8-10 seconds
│
├─ API calls, data fetching
│  └─ 10-15 seconds
│
├─ Complex operations (reports, exports)
│  └─ 15-20 seconds
│
└─ Slow network, large datasets
   └─ 20-30 seconds
```

---

## Anti-Pattern Detector

```
❌ Using sleep()?
   └─ Replace with: waitForElement()

❌ Timeout too long (>30s)?
   └─ Investigate: Why so slow?
   └─ Fix: Optimize app or increase reasonably

❌ Timeout too short (<1s)?
   └─ Increase: Use at least 3-5s for reliability

❌ Ignoring failures?
   └─ Handle: Add try-catch with proper logging

❌ Same timeout everywhere?
   └─ Customize: Match timeout to operation complexity
```

---

## Quick Reference Card

```
┌──────────────────────────────────┬─────────────────────────────┐
│ Method                           │ Best For                    │
├──────────────────────────────────┼─────────────────────────────┤
│ waitForElement()                 │ Standard visibility         │
│ waitForElementToExist()          │ DOM presence                │
│ waitForElementToDisappear()      │ Spinners, modals closing    │
│ waitForText()                    │ Dynamic content             │
│ waitForElementToBeEnabled()      │ Form validation             │
│ waitForAllElements()             │ Page load verification      │
│ waitForAnyElement()              │ Multiple outcomes           │
│ waitForElementWithRetry()        │ Custom conditions           │
│ waitForElementWhileScrolling()   │ Long lists                  │
└──────────────────────────────────┴─────────────────────────────┘
```

---

## Print this guide and keep it handy! 📋

For detailed documentation, see:
- [WAIT_MECHANISMS.md](file:///Users/aaronliu/Documents/repositories/AppAuto/WAIT_MECHANISMS.md)
- [examples/wait-methods-quick-reference.ts](file:///Users/aaronliu/Documents/repositories/AppAuto/examples/wait-methods-quick-reference.ts)
