import type { IMatcherFactory, ILocator } from "@core/ILocator";
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

    switch (locator.strategy) {
      case "raw": {
        const raw = locator.value as { ios?: unknown; android?: unknown };
        const selected = ios ? raw.ios : raw.android;
        if (selected) return String(selected);
        throw new Error(
          `[AppiumMatcherFactory] raw locator missing ios/android: ${JSON.stringify(locator)}`
        );
      }
      case "id": {
        // `~` is WebdriverIO's accessibility-id shortcut; works on both platforms.
        return `~${locator.value as string}`;
      }
      case "text":
      case "label": {
        const text = locator.value as string;
        return ios
          ? `-ios predicate string:label == "${text}"`
          : `android=new UiSelector().text("${text}")`;
      }
      case "traits": {
        logger.debug(
          `[AppiumMatcherFactory] traits ignored (no Appium equivalent): ${locator.value}`
        );
        throw new Error(
          `[AppiumMatcherFactory] "traits" strategy has no Appium equivalent: ${JSON.stringify(locator)}`
        );
      }
      default: {
        const _exhaustive: never = locator.strategy;
        throw new Error(`[AppiumMatcherFactory] unsupported strategy: ${String(_exhaustive)}`);
      }
    }
  }
}
