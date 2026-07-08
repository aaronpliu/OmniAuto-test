# Framework Architecture Guide

## Design Philosophy

1. **One test, all platforms** — same `login.spec.ts` works for iOS Detox, iOS Appium, Android Appium, Android Detox
2. **Zero framework code in tests** — no `TestContext.setActions()`, no lifecycle management in business scripts
3. **Automatic instrumentation** — Proxy-based step recording, lifecycle hooks for screenshots/recording

## Architecture Layers

```
┌──────────────────────────────────────────┐
│  tests/mobile/login.spec.ts              │  ← Business logic only
└──────────────────┬───────────────────────┘
                   │ ActionFactory.create(platform)
┌──────────────────▼───────────────────────┐
│  ActionFactory                           │  ← Platform routing + Proxy wrapping
│    → createActionProxy(DetoxActions)     │
│    → createActionProxy(AppiumActions)    │
│    → TestContext.setActions(actions)     │  ← Auto-register for hooks
└──────────────────┬───────────────────────┘
                   │
┌──────────────────▼───────────────────────┐
│  ActionProxy (Proxy)                     │  ← Step recording
│    intercepts: click/typeText/expect*... │     → StepCollector file
│    wraps: allure-js-commons step()       │     → Allure JSON
└──────────────────┬───────────────────────┘
                   │
┌──────────────────▼───────────────────────┐
│  DetoxActions / AppiumActions            │  ← Actual platform execution
└──────────────────────────────────────────┘
```

## Key Components

### ActionFactory
Single entry point for creating actions. Routes to correct implementation based on platform + automation mode:

```
ios  → IOS_AUTOMATION_MODE=appium → AppiumActions (XCUITest)
ios  → default                    → DetoxActions
android → ANDROID_AUTOMATION_MODE=detox → DetoxActions
android → default                       → AppiumActions (UiAutomator2)
```

### ActionProxy
Wraps every actions instance with a JavaScript `Proxy`. Intercepts all method calls and:
- Generates human-readable step names (`点击 loginButton`, `输入 usernameInput "admin"`)
- Wraps execution in `allure-js-commons step()` (Appium) or writes to file (Detox)
- Takes step-level screenshot on failure

### Step Collector (file-based IPC)
Because Jest test sandbox and Reporter run in different `vm.Context`, steps are communicated via filesystem:
- Proxy writes: `artifacts/allure-results/.pending-steps.jsonl`
- Reporter reads: `detoxAllureReporter.ts`

### Test Lifecycle (testLifecycle.ts)
Registered in `setupFilesAfterEnv` for all mobile Jest configs:
- `beforeEach`: clear step files, start recording (if enabled)
- `afterEach`: detect failure → take screenshot → write to `.pending-attach.jsonl`

### Detox Allure Reporter
Custom Jest reporter for Detox mode (since Detox overrides `allure-jest/node` test environment):
- Writes Allure JSON results directly
- Reads steps from `.pending-steps.jsonl`
- Reads test-level screenshots from `.pending-attach.jsonl`

## Jest Configs

All Jest configs are in `configs/jest/`. `base.config.js` holds shared settings; platform configs extend it.

| Config | Platform | Test Environment | Reporter |
|--------|----------|-----------------|----------|
| `configs/jest/ios.detox.config.js` | iOS Detox | `detox/runners/jest/testEnvironment` | Custom Allure |
| `configs/jest/ios.appium.config.js` | iOS Appium | `allure-jest/node` | Built-in |
| `configs/jest/android.appium.config.js` | Android Appium | `allure-jest/node` | Built-in |
| `configs/jest/android.detox.config.js` | Android Detox | `detox/runners/jest/testEnvironment` | Custom Allure |
