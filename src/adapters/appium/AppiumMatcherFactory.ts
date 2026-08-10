import type { IMatcherFactory, ILocator } from '@core/locator';
import type { IActions } from '@contracts/index';
import { AppiumActions } from './AppiumActions';
import { Logger } from '@utils/logger';

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
    const platform = (globalThis as { driver?: { capabilities?: { platformName?: string } } })
      .driver?.capabilities?.platformName?.toLowerCase() ?? '';
    const ios = platform.includes('ios');

    if (locator.raw) {
      const raw = ios ? locator.raw.ios : locator.raw.android;
      if (raw) return String(raw);
    }

    if (locator.id) {
      // `~` is WebdriverIO's accessibility-id shortcut; works on both platforms.
      return `~${locator.id}`;
    }

    const text = locator.text ?? locator.label;
    if (text) {
      return ios
        ? `-ios predicate string:label == "${text}"`
        : `android=new UiSelector().text("${text}")`;
    }

    if (locator.traits?.length) {
      logger.debug(`[AppiumMatcherFactory] traits ignored (no Appium equivalent): ${locator.traits}`);
    }

    throw new Error(
      `[AppiumMatcherFactory] locator has no id/text/label and no raw selector: ${JSON.stringify(locator)}`,
    );
  }
}
