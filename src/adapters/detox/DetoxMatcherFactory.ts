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

    if (locator.raw?.ios) {
      return locator.raw.ios as Detox.NativeElement;
    }
    if (!locator.id && !locator.text && !locator.label && !locator.traits) {
      throw new Error(
        `[DetoxMatcherFactory] locator has no id/text/label/traits: ${JSON.stringify(locator)}`
      );
    }

    let matcher = by.id(locator.id ?? "");
    if (locator.text) matcher = matcher.and(by.text(locator.text));
    if (locator.label) matcher = matcher.and(by.label(locator.label));
    if (locator.traits?.length) matcher = matcher.and(by.traits(locator.traits));

    return element(matcher);
  }
}
