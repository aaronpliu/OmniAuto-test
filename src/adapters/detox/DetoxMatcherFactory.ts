import type { IMatcherFactory, ILocator } from "@core/ILocator";
import { isAllOfLocator, isAnyOfLocator, isSingleLocator } from "@core/ILocator";
import type { IActions } from "@contracts/index";
import { DetoxActions } from "./DetoxActions";

/**
 * Detox implementation of {@link IMatcherFactory}.
 *
 * Translates a neutral {@link ILocator} into Detox's `element(by.id(...))`
 * handle, wrapped as the driver-agnostic {@link IActions}. Detox composes a
 * single matcher, so `text`/`label`/`traits` are applied via `.and()`; `raw`
 * lets a test pass a prebuilt Detox matcher to escape the neutral model.
 *
 * Composite locators: `allOf` maps to Detox's matcher-level `.and()` (e.g.
 * `allOf(byId("x"), byText("y"))` ⇒ `element(by.id("x").and(by.text("y")))`).
 * `anyOf` has **no Detox equivalent** — Detox matchers only support AND — so it
 * throws a descriptive error. Prefer `allOf` or split into separate locators.
 *
 * Detox is required at runtime; we import it dynamically (via `require`) so the
 * contract/matcher-factory layer stays usable in non-Detox contexts.
 */
export class DetoxMatcherFactory implements IMatcherFactory {
  resolve(locator: ILocator): IActions {
    const native = this.buildElement(locator);
    const description = JSON.stringify(locator);
    return new DetoxActions(native, description);
  }

  /** Build a Detox `element(...)` handle, resolving `allOf` composites via matcher `.and()`. */
  private buildElement(locator: ILocator): Detox.NativeElement {
    if (isAnyOfLocator(locator)) {
      throw new Error(
        `[DetoxMatcherFactory] anyOf (OR) has no Detox equivalent — Detox matchers only support AND. ` +
          `Use allOf or split into separate locators. locator: ${JSON.stringify(locator)}`
      );
    }
    if (isAllOfLocator(locator)) {
      const [first, ...rest] = locator.allOf;
      let matcher = this.buildMatcher(first);
      for (const child of rest) matcher = matcher.and(this.buildMatcher(child));
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const detox = require("detox") as typeof import("detox");
      return detox.element(matcher);
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const detox = require("detox") as typeof import("detox");
    return detox.element(this.buildMatcher(locator));
  }

  /** Build a single Detox matcher (no composition) from a single-strategy locator. */
  private buildMatcher(locator: ILocator): Detox.NativeMatcher {
    if (!isSingleLocator(locator)) {
      throw new Error(
        `[DetoxMatcherFactory] buildMatcher expects a single locator, got composite: ${JSON.stringify(locator)}`
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const detox = require("detox") as typeof import("detox");
    const { by } = detox;

    switch (locator.strategy) {
      case "raw": {
        const raw = locator.value as { ios?: unknown; android?: unknown };
        if (raw.ios) return raw.ios as Detox.NativeMatcher;
        if (raw.android) return raw.android as Detox.NativeMatcher;
        throw new Error(
          `[DetoxMatcherFactory] raw locator missing ios/android: ${JSON.stringify(locator)}`
        );
      }
      case "id": {
        let matcher = by.id(locator.value as string);
        if (locator.traits?.length) matcher = matcher.and(by.traits(locator.traits));
        return matcher;
      }
      case "text": {
        let matcher = by.text(locator.value as string);
        if (locator.traits?.length) matcher = matcher.and(by.traits(locator.traits));
        return matcher;
      }
      case "label": {
        let matcher = by.label(locator.value as string);
        if (locator.traits?.length) matcher = matcher.and(by.traits(locator.traits));
        return matcher;
      }
      case "traits": {
        return by.traits(locator.value as string[]);
      }
      default: {
        const _exhaustive: never = locator.strategy;
        throw new Error(`[DetoxMatcherFactory] unsupported strategy: ${String(_exhaustive)}`);
      }
    }
  }
}
