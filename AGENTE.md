# AGENTE.md — AI Agent 协作指南

本文件为 AI Agent 在此仓库中工作时提供架构与命令参考。

## Common Commands

```bash
# Install dependencies
./start.sh install

# Run tests (interactive menu)
./start.sh

# Run specific platform tests
./start.sh test:ios              # iOS Detox (default)
./start.sh test:ios:appium       # iOS Appium XCUITest
./start.sh test:android          # Android Appium UiAutomator2 (default)
./start.sh test:android:detox    # Android Detox
./start.sh test:web              # Playwright
./start.sh test:api              # Jest + Axios

# With flags
./start.sh test:android --recording --no-screenshot

# Generate and view Allure report
./start.sh report

# Direct npm (bypass start.sh)
npm run test:mobile:ios
npm run test:mobile:android
npm run test:mobile:ios:appium
npm run test:mobile:android:detox

# Plugin management
./start.sh plugin list           # List all plugins and status
./start.sh plugin disable api    # Disable a plugin
./start.sh plugin enable api     # Enable a plugin

# Install Appium drivers (required for Appium modes)
appium driver install uiautomator2 xcuitest

# Check bash syntax for start.sh
bash -n start.sh
```

## Architecture

OmniAutoTest is a cross-platform test automation framework with a **plugin-based
architecture**. **One test script runs on iOS Detox, iOS Appium, Android Appium,
and Android Detox** — platform selection happens at runtime via environment
variables.

### Directory Structure

```
core/            # Zero-plugin-dependency base layer
├── actions/     # ActionFactory, ActionProxy, BaseActions
├── config/      # ConfigManager, MobileConfigLoader, UnifiedConfigLoader
├── interfaces/  # IPlugin, IReporter, IActions, IConfigProvider, etc.
├── lifecycle/   # GlobalSetup, GlobalTeardown, TestLifecycle, LifecycleManager
├── registry/    # PluginRegistry, ActionDispatcher
├── reporting/   # ReportManager, StepRecorder, ScreenshotService, ScreenRecorder
├── selector/    # SelectorBuilder (unified cross-platform selectors)
├── types/       # Shared TypeScript types
└── utils/       # Logger, TestContext, Helpers, SoftAssert

plugins/         # Platform-specific implementations
├── detox/       # DetoxActions, DetoxPlugin, DetoxAllureReporter
├── appium/      # AppiumActions, AppiumPlugin, AppiumServer, DeviceDetectors
├── playwright/  # PlaywrightActions, PlaywrightPlugin
└── api/         # ApiClient, ApiPlugin, ApiAssertions

platform-api/    # Platform integration layer (event publishing, HTTP bridge)
├── EventPublisher.ts
├── JsonBackend.ts
├── PlatformBridge.ts
└── index.ts

configs/         # All configuration files
├── jest/        # Jest configs per platform
├── environments/# Environment-specific JSON configs
└── plugins.json # Plugin enable/disable registry

apps/            # Binary app/apk/ipa files organized by project and platform
├── 3in1/
│   ├── android/
│   └── ios/
└── TestGround/
    ├── android/
    └── ios/

tests/           # Platform-first, then project (pages + tests co-located)
├── mobile/      # Mobile tests (iOS + Android shared)
│   ├── 3in1/
│   │   ├── pages/       # Page objects for 3in1 project
│   │   ├── Smoke/       # Smoke test suite
│   │   └── uitree/      # UI tree analysis reports
│   ├── TestGround/
│   │   ├── pages/
│   │   └── login.spec.ts
│   └── your-app/        # Template project
├── web/         # Web tests (Playwright)
│   └── TestGround/
│       └── login.spec.ts
└── api/         # API tests (Jest + Axios)
    └── auth.spec.ts
```

### Platform Routing

`ActionFactory.create(platform: string)` is the single entry point. It returns a
**Proxy-wrapped** actions instance:

- `platform='ios'` + `IOS_AUTOMATION_MODE=detox` (default) → `DetoxActions`
- `platform='ios'` + `IOS_AUTOMATION_MODE=appium` → `AppiumActions` (XCUITest)
- `platform='android'` + `ANDROID_AUTOMATION_MODE=appium` (default) →
  `AppiumActions` (UiAutomator2)
- `platform='android'` + `ANDROID_AUTOMATION_MODE=detox` → `DetoxActions`
- `platform='web'` → `PlaywrightActions`

`ActionFactory.create()` also calls `TestContext.setActions(actions)` so
lifecycle hooks can access the instance for screenshots/recording. **Test files
should never call `TestContext.setActions()` directly.**

### ActionProxy — Auto Step Recording

Every actions instance returned by `ActionFactory` is wrapped in
`createActionProxy()` (`core/actions/ActionProxy.ts`), a JavaScript `Proxy`. The
Proxy intercepts every method call (`click`, `typeText`, `expectVisible`, etc.)
and:

1. Generates a human-readable Chinese step name (e.g., `"点击 loginButton"`,
   `"输入 usernameInput \"admin\""`)
2. Wraps execution in `allure-js-commons step()` for Appium mode
3. On success: appends `{name, status:'passed', start, stop}` as JSONL to
   `artifacts/allure-results/.pending-steps.jsonl`
4. On failure: calls `target.takeScreenshot()`, appends
   `{name, status:'failed', start, stop, error, screenshot}` to the same file,
   then re-throws

**Internal methods are skipped**: `getDriver`, `buildDefaultCapabilities`,
`selectorToAppiumString`, `resolveElement`, `constructor`, and all `_`-prefixed
properties.

### File-Based IPC (Critical Design Decision)

**Jest test sandbox and Reporter run in different `vm.Context`** — they have
separate `globalThis`. The framework uses filesystem as IPC:

| File                                             | Writer                        | Reader              | Content                     |
| ------------------------------------------------ | ----------------------------- | ------------------- | --------------------------- |
| `artifacts/allure-results/.pending-steps.jsonl`  | ActionProxy (per method call) | DetoxAllureReporter | Step records (JSONL)        |
| `artifacts/allure-results/.pending-attach.jsonl` | TestLifecycle afterEach       | DetoxAllureReporter | Test-level screenshot paths |

Both files are **cleared in `beforeEach`** via `TestLifecycle.ts` (using
`unlinkSync`), and **read-and-cleared** in the Reporter's `onTestResult`. The
append-then-drain pattern provides atomicity.

### Test Lifecycle (Screenshots & Recording)

`core/lifecycle/TestLifecycle.ts` is registered in `setupFilesAfterEnv` for all
mobile Jest configs. It provides zero-touch screenshot and recording:

**`beforeEach`**: Clears `.pending-steps.jsonl` and `.pending-attach.jsonl`.
Starts recording if `VIDEO_RECORDING=true`.

**`afterEach`**: Detects test failure by checking `.pending-steps.jsonl` for any
`status:'failed'` step (works in both Detox and Appium environments since Detox
test environment doesn't populate `expect.getState().suppressedErrors`). On
failure: takes screenshot via `actions.takeScreenshot()`, copies to permanent
`artifacts/screenshots/` (Detox screenshots may be in `/tmp`), writes path to
`.pending-attach.jsonl`.

### Detox Allure Reporter

`plugins/detox/reporters/DetoxAllureReporter.ts` is a custom Jest reporter that
**writes Allure JSON result files directly** — needed because Detox's Jest
config overrides `allure-jest/node` test environment. The reporter:

- In `onTestResult`: reads and drains `.pending-steps.jsonl` and
  `.pending-attach.jsonl` **once before the result loop** (avoids first test
  consuming all steps), copies screenshot files into `allure-results/`, builds
  `{uuid}-result.json` and `{uuid}-container.json`
- Maps Jest statuses: `passed`/`failed`/`skipped`/`broken`
- Only assigns steps to non-skipped tests; only assigns test-level attachments
  to failed tests
- Step-level errors appear only inside the step (not duplicated at test level
  when steps exist)

### Unified Selector System

`core/selector/SelectorBuilder.ts` provides prefix-based cross-platform
selectors:

- `by.id('foo')` → `"id:foo"` → Detox: `by.id('foo')` / Appium: `~foo`
- `by.text('foo')` → `"text:foo"` → Detox: `by.text('foo')` / Appium Android:
  `UiSelector().text("foo")` / Appium iOS: predicate string
- `by.label('foo')` / `by.xpath('...')` / `by.css('...')` /
  `by.className('foo')`
- Plain string `"foo"` → backward compatible as Accessibility ID
- `by.platform({ ios: ..., android: ... })` → platform-specific selector

Page objects import `by` from `@omnitest/core/selector` and are completely
platform-agnostic.

#### Platform-Specific Selectors (PlatformSelector)

When the same element uses different locators on iOS vs Android, use
`by.platform()`:

```typescript
import { by } from "@omnitest/core/selector";

// Same button: iOS uses testID, Android uses text
const loginBtn = by.platform({
  ios: by.id("loginButton"),
  android: by.text("登录"),
});

await actions.click(loginBtn);
```

- Resolved at runtime via `process.env.TEST_PLATFORM` (`ios` / `android`)
- Inner values can be any `TSelector` (strings, prefixed selectors, Detox
  matchers, WebdriverIO elements)
- `AppiumActions` and `DetoxActions` auto-resolve based on their platform
- `PlaywrightActions` (web) throws — PlatformSelector is mobile-only
- `ActionProxy` step names display the resolved selector for the active platform

### Plugin System

Plugins are registered via `configs/plugins.json`:

```json
{
  "detox": { "enabled": true },
  "appium": { "enabled": true },
  "playwright": { "enabled": true },
  "api": { "enabled": true }
}
```

The CLI (`start.sh`) dynamically builds its menu and validates commands based on
this file. Disabled plugins are greyed out and their test commands are blocked.

### Jest Configs

All Jest configs live in `configs/jest/`. `base.config.js` holds shared settings
(ts-jest, moduleNameMapper, transform); platform configs extend it via
`require('./base.config')`. `rootDir` is explicitly set to the project root so
all `<rootDir>/...` paths resolve correctly.

| Config                                  | Platform       | TestEnvironment          | Reporter      | `TestLifecycle` |
| --------------------------------------- | -------------- | ------------------------ | ------------- | --------------- |
| `configs/jest/ios.detox.config.js`      | iOS Detox      | `detox/runners/jest/...` | Custom Allure | ✅              |
| `configs/jest/ios.appium.config.js`     | iOS Appium     | `allure-jest/node`       | Built-in      | ✅              |
| `configs/jest/android.appium.config.js` | Android Appium | `allure-jest/node`       | Built-in      | ✅              |
| `configs/jest/android.detox.config.js`  | Android Detox  | `detox/runners/jest/...` | Custom Allure | ✅              |

### Appium Server

`plugins/appium/server/AppiumServer.ts` manages the Appium server lifecycle as a
singleton. `GlobalSetup.ts` auto-starts it for Android and iOS+Appium modes.
Server logs go to `artifacts/logs/appium-server-{timestamp}.log` (not stdout).
WebdriverIO client log level is set to `'warn'` to suppress HTTP
request/response noise.

### Key Utilities

- `core/utils/TestContext.ts` — Static bridge between test files and lifecycle
  hooks for sharing actions instance
- `core/reporting/ImageResizer.ts` — Uses `sharp` to resize screenshots to max
  800px width for web-friendly report viewing
- `plugins/appium/device/IOSDeviceDetector.ts` — Detects iOS simulators/devices
  via `xcrun simctl` / `xcrun xctrace`
- `plugins/appium/device/AndroidDeviceDetector.ts` — Detects Android devices via
  `adb devices`
- `core/reporting/ScreenRecorder.ts` — Standalone utility for Appium screen
  recording

### Import Path Conventions

| Alias                 | Maps to     | Usage                                  |
| --------------------- | ----------- | -------------------------------------- |
| `@omnitest/core/*`    | `core/*`    | Framework base layer imports           |
| `@omnitest/plugins/*` | `plugins/*` | Plugin-specific imports                |
| `@tests/*`            | `tests/*`   | Pages + tests (co-located per project) |
| `@configs/*`          | `configs/*` | Configuration access                   |

### .detoxrc.js

Entry point for Detox CLI. Requires `configs/mobile.config.local.js` and exports
its `detox` section. Defines Detox configurations: `ios.sim.debug` /
`ios.sim.release` (iPhone 17 Pro) and `android.emu.debug` /
`android.emu.release` (Pixel 10 Pro XL). Binary paths point to
`applications/TestGround/`. Artifacts plugins (screenshot `onFailure`, video,
log) are configured in the top-level `artifacts` field with
`keepOnlyFailedTestsArtifacts: true`.
