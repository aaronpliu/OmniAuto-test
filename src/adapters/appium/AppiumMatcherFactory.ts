import type { IMatcherFactory, ILocator, ISingleLocator } from "@core/ILocator";
import { isAllOfLocator, isAnyOfLocator, isSingleLocator } from "@core/ILocator";
import type { IActions } from "@contracts/index";
import { AppiumActions } from "./AppiumActions";
import { Logger } from "@utils/logger";

const logger = Logger.getInstance();

/**
 * Appium (WebdriverIO) implementation of {@link IMatcherFactory}.
 *
 * Translates a neutral {@link ILocator} into a WebdriverIO selector string,
 * then wraps the resolved element as the driver-agnostic {@link IActions}.
 *
 * Selector precedence: `raw` (driver-specific escape) → `id` (accessibility
 * id, `~id`) → `text`/`label` (platform predicate / UiSelector). `traits` has
 * no Appium equivalent and is ignored (with a debug log).
 *
 * Composite locators (`allOf`/`anyOf`) collapse into a single Appium selector:
 * - iOS: predicates are joined with `AND`/`OR` → `-ios predicate string:(a) AND (b)`.
 * - Android: `allOf` merges each child into one UiSelector (id/text/label are
 *   mutually combinable); `anyOf` cannot be expressed as a single UiSelector, so
 *   it throws a descriptive error (resolve to explicit per-child locators instead).
 */
export class AppiumMatcherFactory implements IMatcherFactory {
  resolve(locator: ILocator): IActions {
    const selector = this.buildSelector(locator);
    const description = JSON.stringify(locator);
    return new AppiumActions(selector, description);
  }

  private buildSelector(locator: ILocator): string {
    const platform =
      (
        globalThis as { driver?: { capabilities?: { platformName?: string } } }
      ).driver?.capabilities?.platformName?.toLowerCase() ?? "";
    const ios = platform.includes("ios");

    if (isAllOfLocator(locator)) {
      return this.compose(locator.allOf, ios, "and");
    }
    if (isAnyOfLocator(locator)) {
      return this.compose(locator.anyOf, ios, "or");
    }
    return this.buildSingle(locator, ios);
  }

  /** Combine child locators into one Appium selector for the active platform. */
  private compose(children: ILocator[], ios: boolean, kind: "and" | "or"): string {
    if (kind === "or" && !ios) {
      // Android UiSelector cannot express OR of independent selectors in one query.
      throw new Error(
        `[AppiumMatcherFactory] anyOf (OR) has no Android UiSelector equivalent; ` +
          `use explicit per-child locators or restrict to iOS. Children: ${JSON.stringify(children)}`
      );
    }

    const fragments = children.map((c) => this.buildFragment(c, ios));

    if (ios) {
      const joined = fragments.map((f) => `(${f})`).join(kind === "and" ? " AND " : " OR ");
      return `-ios predicate string:${joined}`;
    }
    // Android AND: UiSelector builder methods compose on one instance.
    return `android=new UiSelector().${fragments.join("")}`;
  }

  /** Build a single-platform selector fragment for one child (no composition wrapper). */
  private buildFragment(locator: ILocator, ios: boolean): string {
    const single = this.asSingle(locator);
    switch (single.strategy) {
      case "id":
        return ios
          ? `name == "${single.value as string}"`
          : `accessibilityId("${single.value as string}")`;
      case "text":
      case "label": {
        const text = single.value as string;
        return ios ? `label == "${text}"` : `text("${text}")`;
      }
      case "raw": {
        const raw = single.value as { ios?: unknown; android?: unknown };
        const selected = ios ? raw.ios : raw.android;
        if (selected)
          return String(selected).replace(
            /^-ios predicate string:|-android uiautomator:android=new UiSelector\(\)\./,
            ""
          );
        throw new Error(
          `[AppiumMatcherFactory] raw locator missing ios/android: ${JSON.stringify(locator)}`
        );
      }
      default:
        throw new Error(
          `[AppiumMatcherFactory] strategy "${single.strategy}" cannot be composed; use id/text/label/raw children`
        );
    }
  }

  /** Build a single (non-composite) Appium selector for one locator. */
  private buildSingle(locator: ILocator, ios: boolean): string {
    const single = this.asSingle(locator);
    switch (single.strategy) {
      case "raw": {
        const raw = single.value as { ios?: unknown; android?: unknown };
        const selected = ios ? raw.ios : raw.android;
        if (selected) return String(selected);
        throw new Error(
          `[AppiumMatcherFactory] raw locator missing ios/android: ${JSON.stringify(locator)}`
        );
      }
      case "id": {
        // `~` is WebdriverIO's accessibility-id shortcut; works on both platforms.
        return `~${single.value as string}`;
      }
      case "text":
      case "label": {
        const text = single.value as string;
        return ios
          ? `-ios predicate string:label == "${text}"`
          : `android=new UiSelector().text("${text}")`;
      }
      case "traits": {
        logger.debug(
          `[AppiumMatcherFactory] traits ignored (no Appium equivalent): ${single.value}`
        );
        throw new Error(
          `[AppiumMatcherFactory] "traits" strategy has no Appium equivalent: ${JSON.stringify(locator)}`
        );
      }
      default: {
        const _exhaustive: never = single.strategy;
        throw new Error(`[AppiumMatcherFactory] unsupported strategy: ${String(_exhaustive)}`);
      }
    }
  }

  /** Coerce a locator to a single-strategy locator, rejecting composites. */
  private asSingle(locator: ILocator): ISingleLocator {
    if (!isSingleLocator(locator)) {
      throw new Error(
        `[AppiumMatcherFactory] expected a single locator, got composite: ${JSON.stringify(locator)}`
      );
    }
    return locator;
  }
}
