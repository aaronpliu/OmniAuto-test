# ActionFactory Web Platform Support - Implementation Summary

## Overview

The ActionFactory has been enhanced to fully support the web platform, providing
a consistent API across all platforms (iOS, Android, and Web).

## Changes Made

### 1. Type Definition Updates (`framework/types/actions.ts`)

Added optional `page` and `browser` properties to `ActionFactoryConfig`:

```typescript
export interface ActionFactoryConfig {
  platform: Platform;
  capabilities?: Record<string, any>;
  browserType?: "chromium" | "firefox" | "webkit";
  page?: any; // Playwright Page object for web platform
  browser?: any; // Playwright Browser object for web platform (optional)
}
```

### 2. ActionFactory Implementation (`framework/actions/ActionFactory.ts`)

#### Updated `create()` method for web platform:

- Now accepts Page object through config
- Validates that Page object is provided
- Provides clear error message if missing
- Creates PlaywrightActions instance with page and optional browser

```typescript
case 'web': {
  const configObj = typeof config === 'object' ? config : null;

  if (!configObj || !configObj.page) {
    throw new Error(
      'For web platform, a Page object must be provided in the config. ' +
      'Example: ActionFactory.create({ platform: "web", page })'
    );
  }

  return new PlaywrightActions(configObj.page, configObj.browser);
}
```

#### Added `createForWeb()` helper method:

```typescript
static createForWeb(page: any, browser?: any): BaseActions {
  return this.create({ platform: 'web', page, browser });
}
```

### 3. Bug Fix: Geolocation Support (`framework/actions/PlaywrightActions.ts`)

Fixed TypeScript error in `setLocation()` method:

**Before:**

```typescript
async setLocation(latitude: number, longitude: number): Promise<void> {
  logger.info(`Setting location to: ${latitude}, ${longitude}`);
  await this.page.setGeolocation({ latitude, longitude });
  await this.page.reload();
}
```

**After:**

```typescript
async setLocation(latitude: number, longitude: number): Promise<void> {
  logger.info(`Setting location to: ${latitude}, ${longitude}`);
  const context = this.page.context();
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude, longitude });
  await this.page.reload();
}
```

## Usage Examples

### Method 1: Using `createForWeb()` Helper (Recommended)

```typescript
import { test } from "@playwright/test";
import { ActionFactory } from "@omnitest/core/actions";

test("example test", async ({ page }) => {
  const actions = ActionFactory.createForWeb(page);
  await actions.navigateTo("https://example.com");
  await actions.click("#button");
});
```

### Method 2: Using `create()` with Config Object

```typescript
test("example test", async ({ page, browser }) => {
  const actions = ActionFactory.create({
    platform: "web",
    page,
    browser, // optional
  });
  await actions.navigateTo("https://example.com");
});
```

### Method 3: Direct Instantiation (Still Supported)

```typescript
import { PlaywrightActions } from "@omnitest/core/actions";

test("example test", async ({ page }) => {
  const actions = new PlaywrightActions(page);
  await actions.navigateTo("https://example.com");
});
```

## Cross-Platform Consistency

Now you can use the same pattern across all platforms:

```typescript
// For Web
const webActions = ActionFactory.createForWeb(page);

// For iOS
const iosActions = ActionFactory.createForMobile("ios");

// For Android
const androidActions = ActionFactory.createForMobile("android");

// Use the same methods regardless of platform
await actions.navigateTo("https://example.com");
await actions.typeText("#email", "user@example.com");
await actions.click("#submit");
await actions.expectVisible("#success");
```

## Testing

Two test files have been created to verify the implementation:

1. **examples/test-action-factory-web.ts** - Tests web platform functionality
2. **examples/test-action-factory-mobile.ts** - Tests mobile platform
   functionality

Run tests:

```bash
npx ts-node examples/test-action-factory-web.ts
npx ts-node examples/test-action-factory-mobile.ts
```

## Documentation

A quick reference guide has been created at:

- **examples/web-actions-quick-reference.ts**

This file contains:

- All available usage patterns
- Common interaction examples
- Method signature reference
- Best practices and recommendations

## Benefits

1. **Consistent API**: Same factory pattern across all platforms
2. **Type Safety**: Proper TypeScript types for configuration
3. **Clear Errors**: Helpful error messages when misconfigured
4. **Flexibility**: Multiple ways to create actions based on needs
5. **Backward Compatible**: Existing code using direct instantiation still works
6. **Better Developer Experience**: Easier to switch between platforms

## Migration Guide

If you're currently using direct instantiation:

**Before:**

```typescript
const actions = new PlaywrightActions(page);
```

**After (Optional but Recommended):**

```typescript
const actions = ActionFactory.createForWeb(page);
```

Both approaches work, but using ActionFactory provides:

- Consistency with mobile platform code
- Easier platform switching
- Centralized action creation logic
