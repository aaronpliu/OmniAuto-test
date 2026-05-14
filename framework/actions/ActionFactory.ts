import { BaseActions } from './BaseActions';
import { DetoxActions } from './DetoxActions';
import { AppiumActions } from './AppiumActions';
import { PlaywrightActions } from './PlaywrightActions';
import { Platform, ActionFactoryConfig } from '../types/actions';
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

export class ActionFactory {
  static create(config: Platform | ActionFactoryConfig): BaseActions {
    const platform = typeof config === 'string' ? config : config.platform;
    
    logger.info(`Creating actions for platform: ${platform}`);

    switch (platform) {
      case 'ios':
        return new DetoxActions();
      
      case 'android': {
        // AppiumActions will automatically build capabilities from environment variables
        // if none are provided, making it consistent with DetoxActions behavior
        const capabilities = typeof config === 'object' ? config.capabilities : undefined;
        return new AppiumActions(capabilities);
      }
      
      case 'web': {
        // For web, PlaywrightActions requires a Page object
        const configObj = typeof config === 'object' ? config : null;
        
        if (!configObj || !configObj.page) {
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
