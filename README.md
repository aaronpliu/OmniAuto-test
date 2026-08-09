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
  DetoxMatcher    ElementLocator → Detox element(by…)
  DetoxActions    Implements IActions on top of Detox NativeElement

apps/             App-specific assets (per app)
  <app>/locators  Declarative element locators (id/text/label/traits)
  <app>/fixtures  Test data (users, …)
  <app>/pages     Page objects — compose IActions into flows
  <app>/workflows Reusable multi-page flows
  <app>/artifacts Prebuilt app binaries (git-ignored, see below)

tests/            Jest + Detox specs (*.e2e.ts)
utils/            Shared helpers (logger, …)
```

### Why the indirection?
`IActions` + `BaseActions` define a single contract. Each adapter implements it
(`DetoxActions` today). To add another driver (e.g. Appium) you only implement
a new `adapters/<driver>/` package — **existing pages, workflows and tests are
untouched** because they only depend on `IActions`.

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
**never committed** (only the `.gitkeep` placeholder is tracked). Put your
built binaries there, or let Detox build + copy them via the `build` scripts in
`.detoxrc.js`:

```
apps/mock/artifacts/ios/TestingGround.app      ← iOS app (git-ignored)
apps/mock/artifacts/android/app-debug.apk      ← Android APK (git-ignored)
```

`.gitignore` keeps the folders (via `.gitkeep`) but ignores `*.app`, `*.apk`,
`*.aab` so the binaries stay out of git.

## Run tests

Configurations are defined in `.detoxrc.js`:

| Configuration      | Platform | Device (local)      | App                                   |
| ------------------ | -------- | ------------------- | ------------------------------------- |
| `ios.sim.debug`    | iOS      | iPhone 15 Pro       | `apps/mock/artifacts/ios/TestingGround.app` |
| `android.emu.debug`| Android  | `Pixel_6_API_34`    | `apps/mock/artifacts/android/app-debug.apk` |

```bash
# iOS (simulator must be available; Detox launches/installs automatically)
npx detox test --configuration ios.sim.debug

# Android (emulator must be running with AVD Pixel_6_API_34)
npx detox test --configuration android.emu.debug
```

Convenience scripts (see `package.json`):

```bash
npm run test:ios
npm run test:android
```

> **Note:** testIDs in `apps/*/locators/**` must match the app's accessibility
> identifiers. If assertions fail, align the locators with the app's testIDs.

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
  Uses Detox 20 Jest runner (`detox/runners/jest/*`).
- `jest.config.js` — `ts-jest` transform for `*.ts`, Detox global setup/teardown.
- `tsconfig.json` — path aliases (`@contracts`, `@adapters`, `@utils`, `@apps`).

## Notes

- The `android.emu.debug` path requires a built `app-debug.apk` under
  `apps/mock/artifacts/android/` and a running `Pixel_6_API_34` emulator.
- `tsconfig.check.json` is a temporary type-check config; safe to delete.
