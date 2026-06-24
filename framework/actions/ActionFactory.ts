import { BaseActions } from './BaseActions';
import { DetoxActions } from './DetoxActions';
import { AppiumActions } from './AppiumActions';
import { PlaywrightActions } from './PlaywrightActions';
import { Platform, ActionFactoryConfig, IosAutomationMode } from '../types/actions';
import { Logger } from '../utils/logger';

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
  const mode = config?.iosAutomationMode || process.env.IOS_AUTOMATION_MODE || 'detox';
  return mode === 'appium' ? 'appium' : 'detox';
}

export class ActionFactory {
  static create(config: Platform | ActionFactoryConfig): BaseActions {
    const configObj = typeof config === 'string' ? { platform: config } : config;
    const platform = configObj.platform;

    logger.info(`Creating actions for platform: ${platform}`);

    switch (platform) {
      case 'ios': {
        const iosMode = getIosAutomationMode(configObj);
        if (iosMode === 'appium') {
          logger.info('iOS automation mode: Appium (XCUITest)');
          return new AppiumActions(configObj.capabilities);
        }
        logger.info('iOS automation mode: Detox');
        return new DetoxActions();
      }

      case 'android': {
        const capabilities = configObj.capabilities;
        return new AppiumActions(capabilities);
      }

      case 'web': {
        if (!configObj.page) {
          throw new Error(
            'For web platform, a Page object must be provided in the config. ' +
            'Example: ActionFactory.create({ platform: "web", page })'
          );
        }

        return new PlaywrightActions(configObj.page, configObj.browser);
      }

      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  static createForMobile(platform: 'ios' | 'android', capabilities?: Record<string, any>): BaseActions {
    return this.create({ platform, capabilities });
  }

  static createForWeb(page: any, browser?: any): BaseActions {
    return this.create({ platform: 'web', page, browser });
  }
}
