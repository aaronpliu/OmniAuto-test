import type { IMatcherFactory, ILocator } from "@core/ILocator";
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
 * Detox is required at runtime; we import it dynamically (via `require`) so the
 * contract/matcher-factory layer stays usable in non-Detox contexts.
 */
export class DetoxMatcherFactory implements IMatcherFactory {
  resolve(locator: ILocator): IActions {
    const native = this.buildNative(locator);
    const description = JSON.stringify(locator);
    return new DetoxActions(native, description);
  }

  /** Build a Detox native matcher from a neutral locator. */
  private buildNative(locator: ILocator): Detox.NativeElement {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const detox = require("detox") as typeof import("detox");
    const { element, by } = detox;

    switch (locator.strategy) {
      case "raw": {
        const raw = locator.value as { ios?: unknown; android?: unknown };
        if (raw.ios) return raw.ios as Detox.NativeElement;
        if (raw.android) return raw.android as Detox.NativeElement;
        throw new Error(
          `[DetoxMatcherFactory] raw locator missing ios/android: ${JSON.stringify(locator)}`
        );
      }
      case "id": {
        let matcher = by.id(locator.value as string);
        if (locator.traits?.length) matcher = matcher.and(by.traits(locator.traits));
        return element(matcher);
      }
      case "text": {
        let matcher = by.text(locator.value as string);
        if (locator.traits?.length) matcher = matcher.and(by.traits(locator.traits));
        return element(matcher);
      }
      case "label": {
        let matcher = by.label(locator.value as string);
        if (locator.traits?.length) matcher = matcher.and(by.traits(locator.traits));
        return element(matcher);
      }
      case "traits": {
        return element(by.traits(locator.value as string[]));
      }
      default: {
        const _exhaustive: never = locator.strategy;
        throw new Error(`[DetoxMatcherFactory] unsupported strategy: ${String(_exhaustive)}`);
      }
    }
  }
}
