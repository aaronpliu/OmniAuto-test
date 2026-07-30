import { BaseActions } from "./BaseActions";
import { DetoxActions } from "../../plugins/detox/DetoxActions";
import { AppiumActions } from "../../plugins/appium/AppiumActions";
import { PlaywrightActions } from "../../plugins/playwright/PlaywrightActions";
import { createActionProxy } from "./ActionProxy";
import { TestContext } from "../utils/TestContext";
import {
  Platform,
  ActionFactoryConfig,
  IosAutomationMode,
  AndroidAutomationMode,
} from "../types/actions";
import { Logger } from "../utils/Logger";

const logger = Logger.getInstance();

/**
 * Type guard to check if actions is DetoxActions
 */
export function isDetoxActions(actions: BaseActions): actions is DetoxActions {
  return actions instanceof DetoxActions;
}

/**
 * Type guard to check if actions is AppiumActions
 */
export function isAppiumActions(actions: BaseActions): actions is AppiumActions {
  return actions instanceof AppiumActions;
}

/**
 * Type guard to check if actions is PlaywrightActions
 */
export function isPlaywrightActions(actions: BaseActions): actions is PlaywrightActions {
  return actions instanceof PlaywrightActions;
}

/**
 * 获取 iOS 自动化模式
 * 优先级：参数 > 环境变量 IOS_AUTOMATION_MODE > 默认 'detox'
 */
function getIosAutomationMode(config?: ActionFactoryConfig): IosAutomationMode {
  const mode = config?.iosAutomationMode || process.env.IOS_AUTOMATION_MODE || "detox";
  return mode === "appium" ? "appium" : "detox";
}

/**
 * 获取 Android 自动化模式
 * 优先级：参数 > 环境变量 ANDROID_AUTOMATION_MODE > 默认 'appium'
 */
function getAndroidAutomationMode(config?: ActionFactoryConfig): AndroidAutomationMode {
  const mode = config?.androidAutomationMode || process.env.ANDROID_AUTOMATION_MODE || "appium";
  return mode === "detox" ? "detox" : "appium";
}

export class ActionFactory {
  static create(config: Platform | ActionFactoryConfig): BaseActions {
    const configObj = typeof config === "string" ? { platform: config } : config;
    const platform = configObj.platform;

    logger.info(`Creating actions for platform: ${platform}`);

    switch (platform) {
      case "ios": {
        const iosMode = getIosAutomationMode(configObj);
        const actions =
          iosMode === "appium"
            ? createActionProxy(new AppiumActions(configObj.capabilities))
            : createActionProxy(new DetoxActions());
        logger.info(`iOS automation mode: ${iosMode === "appium" ? "Appium (XCUITest)" : "Detox"}`);
        TestContext.setActions(actions);
        return actions;
      }

      case "android": {
        const androidMode = getAndroidAutomationMode(configObj);
        const actions =
          androidMode === "detox"
            ? createActionProxy(new DetoxActions())
            : createActionProxy(new AppiumActions(configObj.capabilities));
        logger.info(
          `Android automation mode: ${androidMode === "detox" ? "Detox" : "Appium (UiAutomator2)"}`
        );
        TestContext.setActions(actions);
        return actions;
      }

      case "web": {
        if (!configObj.page) {
          throw new Error(
            "For web platform, a Page object must be provided in the config. " +
              'Example: ActionFactory.create({ platform: "web", page })'
          );
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- page/browser typed as any in ActionFactoryConfig
        const actions = createActionProxy(new PlaywrightActions(configObj.page, configObj.browser));
        TestContext.setActions(actions);
        return actions;
      }

      default:
        throw new Error(`Unsupported platform: ${String(platform)}`);
    }
  }

  static createForMobile(
    platform: "ios" | "android",
    capabilities?: Record<string, any>
  ): BaseActions {
    return this.create({ platform, capabilities });
  }

  static createForWeb(page: any, browser?: any): BaseActions {
    return this.create({ platform: "web", page, browser });
  }
}
