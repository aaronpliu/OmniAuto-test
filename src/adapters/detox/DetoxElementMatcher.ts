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
 * `DetoxElementMatcher` turns a declarative {@link ElementLocator} into a
 * Detox `NativeElement` and wraps it in a {@link DetoxActions}.
 *
 * Detox's `element(by...)` returns the handle lazily; we only resolve the
 * native element once and reuse it for every action.
 */
export class DetoxElementMatcher {
  /** Lazily resolved native Detox element. */
  private native: Detox.NativeElement | undefined;

  constructor(private readonly locator: ElementLocator) {}

  /**
   * Build the Detox `NativeElement` from the locator. Detox is required at
   * runtime; we import it dynamically to keep this module usable in non-Detox
   * contexts (e.g. unit tests of the contract layer).
   */
  private async buildNative(): Promise<Detox.NativeElement> {
    if (this.native) return this.native;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const detox = require('detox') as typeof import('detox');
    const { element, by } = detox;
    let matcher = by.id(this.locator.id!);
    if (this.locator.text !== undefined) matcher = by.text(this.locator.text);
    if (this.locator.label !== undefined) matcher = by.label(this.locator.label);
    if (this.locator.traits && this.locator.traits.length) {
      matcher = by.traits(this.locator.traits);
    }
    this.native = element(matcher);
    return this.native;
  }

  /** Resolve this locator into a contract-compliant {@link DetoxActions}. */
  async resolve(): Promise<DetoxActions> {
    const native = await this.buildNative();
    const description = JSON.stringify(this.locator);
    return new DetoxActions(native, description);
  }
}
