# Framework Enhancement Plan — OmniAutoTest/e2e

> Goal: keep the core framework easy to maintain, easy to extend (add more
> automation drivers), and ensure new extensions never break existing usage.

## Current architecture (good parts)

```
contracts/  IActions, BaseActions, ILocator, IAppLauncher   (driver-neutral contracts)
core/       Driver registry, IDriver, BasePage              (selector + page base)
adapters/   detox/*, appium/*                               (each framework implements contract once)
apps/<app>/ pages, locators, workflows                      (business layer, driver-agnostic)
```

Strengths: locator abstraction (`ILocator` + `IMatcherFactory`) is the hardest
part and is done well; `BaseActions` provides shared guards + `tapIfExists`;
pages/tests depend only on `IDriver`/`ILocator` — so a new driver only touches
`adapters/`. This is the single most valuable property and must be preserved.

## Enhancement phases

### Phase 1 — Single source of truth + registration self-check (E1 + E2)

Highest value, lowest risk. Directly hardens "maintainable" and "no break on
extend".

- **E1 — Single `DriverName` source**
  - `src/core/IDriver.ts` already exports `DriverName` (`"detox" | "appium"`).
  - `src/configs/env.ts`: remove its local duplicate `DriverName`; import from
    `@core/IDriver` instead.
  - `src/core/Driver.ts` `driverFromEnv()`: use `DriverName` from
    `@core/IDriver` (no local literal re-check).
- **E2 — Registration self-check / lazy bootstrap**
  - `getDriver()` in `src/core/Driver.ts`: when `registry` is empty,
    `await import("@adapters")` to trigger side-effect registration before
    resolving. Eliminates "forgot to import adapters → runtime 'unknown driver'"
    failure.
  - Add `assertAllDriversRegistered(expected: DriverName[])` helper for
    CI/startup self-check.
- Result: adding a new driver requires editing only `src/adapters/index.ts`.

### Phase 2 — Contract layering (E3)

Paves the way for a 3rd driver without forcing it to implement unsupported
actions.

- `src/contracts/IActions.ts`: keep **core** methods only (`tap`, `typeText`,
  `clearText`, `isVisible`, `toBeVisible`, `toExist`, `toHaveText`,
  `getAttributes`, `tapIfExists`, `scrollTo`, `waitFor`, etc. — the set every
  driver must support).
- New `src/contracts/IOptionalActions.ts`: driver-optional methods (`pinch`,
  `scrollToIndex`, `setColumnToValue`, `setDatePickerDate`,
  `adjustSliderToPosition`, `performAccessibilityAction`, `setToggleValue`).
- `BaseActions`: `abstract` core set; optional methods get a default
  `throw new NotSupportedError()` (Promote the existing Appium pattern up to the
  base).
- `DetoxActions` / `AppiumActions`: drop duplicate `NotSupportedError` branches
  that the base class now provides.
- Risk: medium — touches abstract signatures; must run both `typecheck` suites.
- Verification: `npm run typecheck` + `npm run typecheck:appium` pass; no change
  to `apps/` or `tests/`.

### Phase 3 — Locator strategy enum (E4)

Makes matcher factories easier to extend with new lookup strategies.

- `src/core/ILocator.ts`: move from loose fields
  (`id`/`text`/`label`/`traits`/`raw`) to
  `{ strategy: "id" | "text" | "label" | "raw"; value: string | { ios?; android? } }`.
- `DetoxMatcherFactory.buildSelector` / `AppiumMatcherFactory.buildSelector`:
  switch on `strategy`.
- `apps/mock/locators/login.locators.ts`: migrate the 6 existing locators to the
  new shape (only 1 locator file exists in the repo today → small blast radius).
- Verification: both `typecheck` suites + existing login spec still resolve
  locators.

### Phase 4 (optional) — BasePage assertion helpers (E5)

Further reduce page-object boilerplate.

- `src/core/BasePage.ts`: add `expectVisible(loc)` / `expectText(loc, txt)` /
  `expectExists(loc)` thin wrappers delegating to `find(loc)`.
- Pages call `await this.expectVisible(loginLocators.welcome)` instead of
  `await this.find(loginLocators.welcome).toBeVisible()`.
- Low priority; can be deferred.

## Execution order

Phase 1 → Phase 2 → Phase 3 → (Phase 4 optional). Each phase is an independent,
reviewable change. Pages/tests should require no edits except where Phase 3
mandates locator migration.

## Verification per phase

- `npm run typecheck` (Detox) and `npm run typecheck:appium` (Appium) both pass.
- `apps/` and `tests/` unchanged unless the phase explicitly requires it.

## Out of scope

- Adding a real 3rd driver (Espresso/Playwright). The plan only makes that
  cheaper.
- Runner config changes (jest/wdio) beyond what Phase 1 needs.
