import type { IActions } from '@contracts/IActions';
import { DetoxActions } from './DetoxActions';

/**
 * Matcher strategies supported for locating a UI element. These map 1:1 onto
 * Detox's `by` matchers so the framework can stay declarative.
 */
export interface ElementLocator {
  /** Match by testID / accessibility identifier. */
  id?: string;
  /** Match by visible text. */
  text?: string;
  /** Match by accessibility label. */
  label?: string;
  /** Match by trait (e.g. 'button', 'link'). */
  traits?: string[];
}

/**
 * `DetoxMatcher` turns a declarative {@link ElementLocator} into a
 * Detox `NativeElement` and wraps it in a {@link DetoxActions}.
 *
 * Element resolution is synchronous: Detox's `element(by...)` returns the
 * handle immediately (actions only become async when dispatched via `.tap()`
 * etc.), so there is no reason to `await` the resolver. This keeps page-object
 * element access free of nested `await (await …)` calls.
 */
export class DetoxMatcher {
  constructor(private readonly locator: ElementLocator) {}

  /**
   * Build the Detox `NativeElement` from the locator. Detox is required at
   * runtime; we import it dynamically to keep this module usable in non-Detox
   * contexts (e.g. unit tests of the contract layer).
   */
  private buildNative(): Detox.NativeElement {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const detox = require('detox') as typeof import('detox');
    const { element, by } = detox;
    let matcher = by.id(this.locator.id!);
    if (this.locator.text !== undefined) matcher = by.text(this.locator.text);
    if (this.locator.label !== undefined) matcher = by.label(this.locator.label);
    if (this.locator.traits && this.locator.traits.length) {
      matcher = by.traits(this.locator.traits);
    }
    return element(matcher);
  }

  /** Resolve this locator into a contract-compliant {@link IActions}. */
  resolve(): IActions {
    const description = JSON.stringify(this.locator);
    return new DetoxActions(this.buildNative(), description);
  }
}
