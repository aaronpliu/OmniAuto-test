# DetoxActions Enhancement Summary

## Overview
The `DetoxActions` class has been enhanced to support multiple locator strategies beyond just `by.id()`, providing greater flexibility for selecting elements that don't have test IDs.

## Key Changes

### 1. Flexible Selector Type
- **New Type**: `DetoxSelector = string | ReturnType<typeof element>`
- **Backward Compatible**: String selectors still work (defaults to `by.id()`)
- **Enhanced**: Can now pass Detox NativeElement matchers directly

### 2. Helper Resolution Function
```typescript
function resolveElement(selector: DetoxSelector): ReturnType<typeof element> {
  if (typeof selector === 'string') {
    return element(by.id(selector)); // Backward compatibility
  }
  return selector; // Use provided matcher directly
}
```

### 3. Static Helper Methods
Added convenient static methods to create Detox matchers:

| Method | Description | Example |
|--------|-------------|---------|
| `byId(id)` | Match by test ID | `DetoxActions.byId('loginBtn')` |
| `byText(text)` | Match by text content | `DetoxActions.byText('Submit')` |
| `byLabel(label)` | Match by accessibility label | `DetoxActions.byLabel('Menu')` |
| `byType(type)` | Match by native type | `DetoxActions.byType('UIButton')` |
| `byAll(...)` | Combine matchers with AND | `DetoxActions.byAll(by.id('btn'), by.text('OK'))` |

### 4. Fixed Issues
- ✅ Fixed `toBeEnabled()` / `toBeDisabled()` TypeScript errors
- ✅ Fixed `pinchWithScale()` → `pinch()` method name
- ✅ Added proper error messages for enabled/disabled assertions

## Usage Examples

### Before (Limited to by.id only)
```typescript
// Could ONLY use test IDs
await actions.click('loginButton');
await actions.typeText('usernameInput', 'john');
```

### After (Multiple Strategies)

#### Method 1: String Selectors (Backward Compatible)
```typescript
// Still works - uses by.id() automatically
await actions.click('loginButton');
await actions.typeText('usernameInput', 'john');
```

#### Method 2: Static Helpers
```typescript
// Match by text
const submitBtn = DetoxActions.byText('Submit');
await actions.click(submitBtn);

// Match by label
const menu = DetoxActions.byLabel('Open Menu');
await actions.tap(menu);

// Match by type
const scrollView = DetoxActions.byType('UIScrollView');
await actions.scroll(scrollView);
```

#### Method 3: Direct Detox Matchers
```typescript
// Use Detox matchers directly
await actions.click(element(by.text('Submit')));
await actions.expectVisible(element(by.label('Welcome')));

// Combine matchers
const specificBtn = element(by.text('Submit').and(by.id('submitBtn')));
await actions.click(specificBtn);

// Match with ancestor/descendant
const nestedEl = element(by.id('child').withAncestor(by.id('parent')));
await actions.expectVisible(nestedEl);
```

#### Method 4: Complex Queries with byAll()
```typescript
// Find element matching multiple criteria
const complexEl = DetoxActions.byAll(
  by.id('input'),
  by.label('Username'),
  by.type('UITextField')
);
await actions.typeText(complexEl, 'testuser');
```

## Practical Scenarios

### Scenario 1: Elements Without Test IDs
```typescript
// Problem: Button has no testID, only displays "Login"
const loginBtn = DetoxActions.byText('Login');
await actions.click(loginBtn);
```

### Scenario 2: Dynamic Content
```typescript
// Match items by their dynamic text content
const userItem = DetoxActions.byText('John Doe');
await actions.tap(userItem);
```

### Scenario 3: Platform-Specific Types
```typescript
// iOS
const iosButton = DetoxActions.byType('UIButton');

// Android
const androidButton = DetoxActions.byType('android.widget.Button');

// Cross-platform semantic types
const button = DetoxActions.byType('button');
const image = DetoxActions.byType('image');
```

### Scenario 4: Precise Matching
```typescript
// Avoid matching multiple elements by combining criteria
const specificSubmit = DetoxActions.byAll(
  by.text('Submit'),
  by.id('form-submit-btn')
);
await actions.click(specificSubmit);
```

## Benefits

1. **Flexibility**: No longer limited to test IDs
2. **Maintainability**: Easier to select elements in apps without comprehensive test IDs
3. **Precision**: Combine matchers for accurate element selection
4. **Backward Compatibility**: Existing tests continue to work unchanged
5. **Type Safety**: Full TypeScript support with proper types

## Migration Guide

### For Existing Tests
No changes required! String selectors work exactly as before:
```typescript
// This still works
await actions.click('myButton');
```

### For New Tests
Choose the best strategy for your use case:

1. **Has testID?** → Use string or `DetoxActions.byId()`
   ```typescript
   await actions.click('loginBtn');
   // or
   await actions.click(DetoxActions.byId('loginBtn'));
   ```

2. **No testID, has text?** → Use `DetoxActions.byText()`
   ```typescript
   await actions.click(DetoxActions.byText('Submit'));
   ```

3. **No testID, has label?** → Use `DetoxActions.byLabel()`
   ```typescript
   await actions.tap(DetoxActions.byLabel('Menu'));
   ```

4. **Need precision?** → Combine with `DetoxActions.byAll()`
   ```typescript
   const el = DetoxActions.byAll(
     by.id('btn'),
     by.text('OK')
   );
   await actions.click(el);
   ```

## Files Modified

- ✅ `framework/actions/DetoxActions.ts` - Enhanced with flexible selectors
- ✅ `examples/detox-usage-examples.ts` - Comprehensive usage examples (NEW)
- ✅ `DETOX_ENHANCEMENTS.md` - This documentation (NEW)

## Testing

All existing tests should continue to pass without modification. The enhancement is fully backward compatible.

To test new features:
```bash
npm run test:mobile:ios
```

## Additional Notes

- The `pinch()` method now accepts optional `speed` and `angle` parameters
- Error messages for `expectEnabled()` and `expectDisabled()` are more generic (don't assume id-based selection)
- All methods maintain consistent logging with selector type information
