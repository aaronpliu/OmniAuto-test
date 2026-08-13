# OmniAutoTest — E2E

Cross-platform end-to-end test automation built on [Detox](https://wix.github.io/Detox/).
The framework keeps a **driver-agnostic action layer** so concrete adapters
(Detox today, others tomorrow) plug in without touching test or page logic.

## Architecture

```
contracts/        Unified interface + abstract base (driver-agnostic)
  IActions        Element action contract (tap, typeText, toBeVisible, …)
  BaseActions     Abstract implementation: guards + resolve() extension point
  types           Shared primitives (Point, Direction, ElementAttributes, …)

adapters/detox/   Concrete Detox adapter
  DetoxMatcherFactory  ElementLocator → Detox element(by…)
  DetoxActions    Implements IActions on top of Detox NativeElement

adapters/appium/  Concrete Appium (WebdriverIO) adapter
  AppiumMatcherFactory  ElementLocator → wdio `~id` / predicate selector
  AppiumActions          Implements IActions on top of a wdio element
  AppiumAppLauncher      (re)starts the app via launchApp/restartApp

apps/             App-specific assets (per app)
  <app>/locators  Declarative element locators (id/text/label/traits)
  <app>/fixtures  Test data (users, …)
  <app>/pages     Page objects — compose IActions into flows
  <app>/workflows Reusable multi-page flows
  <app>/artifacts Prebuilt app binaries (git-ignored, see below)

tests/            Jest + Detox specs (*.e2e.ts)
utils/            Shared helpers (logger, SmokeReporter, …)

core/             Driver-neutral core (env-switchable entry point)
  ILocator        Neutral locator model + IMatcherFactory (locator → IActions)
  IDriver         Driver facade types (matcher + launcher) + DriverName
  Driver          Registry / selector — getDriver(E2E_DRIVER), registerDriver
  index           Entry point (`@core`): re-exports getDriver + types
```

### Why the indirection?
`IActions` + `BaseActions` define a single contract. Each adapter implements it
(`DetoxActions` today). To add another driver (e.g. Appium) you only implement
a new `adapters/<driver>/` package — **existing pages, workflows and tests are
untouched** because they only depend on `IActions`.

### Naming conventions

Follow these rules so the driver-agnostic core stays consistent with `contracts/`:

- **Interface files use an `I` prefix** — e.g. `IActions.ts`, `IAppLauncher.ts`,
  `ILocator.ts`, `IDriver.ts`. The `I` is the file name, not just the type:
  a file that *only* declares interfaces is named `I<Name>.ts`.
- **`index.ts` is the entry point** of a directory. For `src/core`, import the
  driver selector and types from `@core/index` (aliased as `@core`) — not from
  a concrete module like `@core/Driver` or `@core/ILocator`.
- **Concrete (non-interface) modules keep their PascalCase name** — e.g.
  `Driver.ts` (registry logic), `BaseActions.ts`, `DetoxActions.ts`.
- **Pages/workflows/specs must never import a concrete adapter** (e.g.
  `@adapters/detox/*`); they depend only on `@core` and `IActions`.

```ts
// ✅ correct
import { getDriver } from '@core';          // entry point
import type { ILocator } from '@core/ILocator';

// ❌ avoid
import { getDriver } from '@core/Driver';   // concrete module
```

## Prerequisites

- Node 20+ (matches `@types/node ^20`).
- macOS for iOS; Android SDK + emulator for Android.
- iOS only: [`applesimutils`](https://github.com/wix/AppleSimulatorUtils) — a
  Detox iOS runtime dependency (permissions / biometrics / location). It is a
  **Homebrew system tool, not an npm package**.

## Install

```bash
npm install
```

This installs `detox`, `jest`, `ts-jest`, `winston`, `eslint`, `husky` and
`lint-staged`. Two lifecycle hooks run automatically:

- **`postinstall`** — installs `applesimutils` from the bundled offline binary
  (macOS only; no-op elsewhere) so iOS testing works without Homebrew/internet.
  See `offline_library/README.md`.
- **`prepare`** — initializes [Husky](https://typicode.github.io/husky/), wiring
  the git pre-commit hook.

> The binary itself is version-managed in `offline_library/` (see
> `offline_library/README.md`); `postinstall` only links it into
> `node_modules/.bin`. No manual step is required on a fresh clone.

## Git hooks & linting

[Husky](https://typicode.github.io/husky/) + [lint-staged](https://github.com/lint-staged/lint-staged)
run on every commit:

- `.husky/pre-commit` ⇒ `npx lint-staged`
- lint-staged lints staged `*.ts` files with `eslint --fix` and type-checks via
  `tsc --noEmit`.

You can also run these manually:

```bash
npm run lint        # eslint over all .ts
npm run typecheck   # tsc --noEmit
```

> **Note:** `applesimutils` is a **Homebrew system tool, not an npm package**, so
> it is not installed by `npm install` itself — the `postinstall` script copies
> the bundled prebuilt binary into the system PATH.

## App binaries & `.gitignore`

Prebuilt apps live under `apps/<app>/artifacts/{ios,android}/` and are
**never committed** (only the `.gitkeep` placeholder is tracked). Build/install
the app separately (we use **release** builds, not debug), then point Detox at
the artifact via `binaryPath` in `.detoxrc.js` (no `build` step is defined):

```
apps/mock/artifacts/ios/TestingGround.app      ← iOS app (git-ignored)
apps/mock/artifacts/android/app-release.apk    ← Android release APK (git-ignored)
```

`.gitignore` keeps the folders (via `.gitkeep`) but ignores `*.app`, `*.apk`,
`*.aab` so the binaries stay out of git.

## Run tests

Configurations are defined in `.detoxrc.js`:

| Configuration       | Platform | Device (local)      | App                                   |
| ------------------- | -------- | ------------------- | ------------------------------------- |
| `ios.sim.release`    | iOS      | iPhone 15 Pro       | `apps/mock/artifacts/ios/TestingGround.app` |
| `android.emu.release`| Android  | `Pixel_6_API_34`    | `apps/mock/artifacts/android/app-release.apk` |
| `android.device.release` | Android | real device (attached) | `apps/mock/artifacts/android/app-release.apk` |

```bash
# iOS (simulator must be available; Detox launches/installs automatically)
npx detox test --configuration ios.sim.release

# Android (emulator must be running with AVD Pixel_6_API_34)
npx detox test --configuration android.emu.release

# Android on a real attached device
npx detox test --configuration android.device.release
```

Convenience scripts (see `package.json`):

```bash
npm run test:ios
npm run test:android
```

Smoke-only runs (fast checks via the framework-agnostic `SmokeReporter`):

```bash
npm run test:smoke              # Detox (Jest) — tests/smoke.e2e.ts
npm run test:smoke:appium       # Appium (Mocha) — same spec, writes reports/*.json
```

> **Note:** testIDs in `apps/*/locators/**` must match the app's accessibility
> identifiers. If assertions fail, align the locators with the app's testIDs.

## Run with Appium (alternative driver)

The same specs run under Appium via WebdriverIO — no page/test changes needed.
Two env vars select the setup: `E2E_DRIVER=appium` (resolve the Appium adapter)
and `PLATFORM` (`ios` default / `android`, selects the Appium capability).

`wdio.conf.ts` defines **both** iOS (XCUITest) and Android (UiAutomator2)
capabilities; `PLATFORM` picks which one is active. App paths default to the
same git-ignored artifacts Detox uses:

| Platform | Automation | App path                                       | Device / AVD        |
| -------- | ---------- | ---------------------------------------------- | ------------------- |
| iOS      | XCUITest   | `apps/mock/artifacts/ios/TestingGround.app`     | `iPhone 15 Pro`     |
| Android  | UiAutomator2 | `apps/mock/artifacts/android/app-release.apk` | `Pixel_6_API_34`    |

```bash
# Install the Appium/wdio toolchain (one-time)
npm install

# --- iOS (default) ---
npm run test:appium                 # E2E_DRIVER=appium PLATFORM=ios

# --- Android ---
npm run test:appium:android         # E2E_DRIVER=appium PLATFORM=android

# Override any default via env vars (all optional):
export APPIUM_APP_PATH=/abs/path/to/app.apk   # override the default artifact path
export DEVICE_NAME="iPhone 15 Pro"            # or "Pixel_6_API_34"
export PLATFORM_VERSION="17.0"                # or "14.0"
export AVD_NAME="Pixel_6_API_34"              # Android emulator to launch
export UDID="<sim-udid>"                      # iOS: pin a specific simulator
export APPIUM_APP_PACKAGE="com.testingground" # Android only
export APPIUM_APP_ACTIVITY="com.testingground.MainActivity"  # Android only
```

`wdio.conf.ts` starts a local Appium server (`@wdio/appium-service`), injects
the wdio session into `globalThis.driver` (the bridge `AppiumActions` /
`AppiumAppLauncher` use), and reuses the specs with the same path aliases.

> To use an existing Appium server instead of the bundled one, remove the
> `services: ['appium']` line and set `hostname` / `port` in `wdio.conf.ts`.

## Smoke reporter

`src/utils/SmokeReporter.ts` is a **framework-agnostic** reporter, so the same
summary is produced on both runners (Detox→Jest and Appium→Mocha). It does not
implement a Jest or wdio reporter interface — smoke cases just record their
outcome and call `finish()`.

```ts
import { SmokeReporter, runSmoke } from '@utils/SmokeReporter';

const reporter = new SmokeReporter({ reportDir: env.REPORT_DIR });
await runSmoke('app-launch', () => getDriver().launcher.launchApp(), reporter);
await runSmoke('promo-dismiss', () => page.dismissPromoIfPresent(), reporter);

const summary = await reporter.finish(); // prints summary, writes JSON if reportDir set
if (!summary.success) throw new Error('Smoke failed');
```

- `runSmoke(name, fn, reporter)` — measures duration, captures errors, records
  the result automatically.
- `reporter.finish()` — logs a `[PASS]/[FAIL]/[SKIP]` summary + counts, and
  (when `reportDir` is given) writes `reports/<name>-<ts>.json`.
- See `tests/smoke.e2e.ts` for a full example that runs under both drivers.

> The JSON artifact is written under `reports/`, which is already git-ignored.

## Add a new test

1. **Locator** — add entries in `apps/<app>/locators/*.locators.ts`.
2. **Page** — expose elements with `find(locator)` (a thin helper returning
   `IActions` from the adapter) and compose semantic flows:
   ```ts
   await this.find(loginLocators.username).typeText(user);
   await this.find(loginLocators.submit).tap();
   ```
3. **Spec** — create `tests/<feature>.e2e.ts` (Jest + Detox globals
   `device`/`element`/`expect` are injected via `exposeGlobals`).

## Configuration files

- `.detoxrc.js` — apps, devices, configurations, behavior, artifacts, logger.
  Uses Detox 20 Jest runner (`detox/runners/jest/*`). `apps` declare only
  `binaryPath` (prebuilt artifacts, no `build` step); `configurations` cover
  iOS simulator, Android emulator, and a real attached Android device
  (`android.device.release` — select a specific device via `DETOX_ANDROID_DEVICE`).
- `jest.config.js` — `ts-jest` transform for `*.ts`, Detox global setup/teardown.
- `tsconfig.json` — path aliases (`@contracts`, `@adapters`, `@utils`, `@apps`);
  checked by `npm run typecheck` (covers `src`, `apps`, `tests`).
- `tsconfig.appium.json` — extends `tsconfig.json`, adds `wdio.conf.ts` and the
  `@wdio/types` lib; checked by `npm run typecheck:appium` (run after
  `npm install` so the WebdriverIO types are present).
- `wdio.conf.ts` — WebdriverIO/Appium runner config for `E2E_DRIVER=appium`.
- `src/configs/env.ts` — **single source of truth** for all environment
  variables. Centralizes defaults, types (`E2E_DRIVER`, `PLATFORM`, …) and
  platform-aware logic, and loads `.env` via `dotenv`. All call sites import
  from here instead of reading `process.env` directly. See `.env.example`.

### Environment variables

All variables are consolidated in `src/configs/env.ts` and documented in
`.env.example` (copy to `.env` to override locally). Summary:

| Variable | Default | Notes |
|---|---|---|
| `E2E_DRIVER` | `detox` | `detox` \| `appium` |
| `PLATFORM` | `ios` | `ios` \| `android` (Appium only) |
| `DEVICE_NAME` | `iPhone 15 Pro` / `Pixel_6_API_34` | platform-aware |
| `PLATFORM_VERSION` | `17.0` / `14.0` | platform-aware |
| `UDID` | — | iOS simulator UDID (optional) |
| `AVD_NAME` | `Pixel_6_API_34` | Android AVD |
| `APPIUM_APP_PATH` | per-platform artifact path | override app binary |
| `APPIUM_APP_PACKAGE` / `APPIUM_APP_ACTIVITY` | `com.testingground` / `…MainActivity` | Android |
| `REPORT_DIR` | — | smoke JSON output dir |
| `LOG_LEVEL` | `info` | trace\|debug\|info\|warn\|error |
| `OMNITEST_SESSION_DIR` | — | injected by global setup |

## Notes

- The `android.emu.release` path requires a built `app-release.apk` under
  `apps/mock/artifacts/android/` and a running `Pixel_6_API_34` emulator.
- `tsconfig.check.json` is a temporary type-check config; safe to delete.
