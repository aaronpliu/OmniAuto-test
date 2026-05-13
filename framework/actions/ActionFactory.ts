import { BaseActions } from './BaseActions';
import { DetoxActions } from './DetoxActions';
import { AppiumActions } from './AppiumActions';
import { PlaywrightActions } from './PlaywrightActions';
import { Platform, ActionFactoryConfig } from '../types/actions';
import { Logger } from '../utils/logger';

const logger = Logger.getInstance();

export class ActionFactory {
  static create(config: Platform | ActionFactoryConfig): BaseActions {
    const platform = typeof config === 'string' ? config : config.platform;
    
    logger.info(`Creating actions for platform: ${platform}`);

    switch (platform) {
      case 'ios':
        return new DetoxActions();
      
      case 'android': {
        const capabilities = typeof config === 'object' && config.capabilities ? config.capabilities : {};
        return new AppiumActions(capabilities);
      }
      
      case 'web': {
        // For web, PlaywrightActions requires a Page object
        // This should be passed from the test setup
        throw new Error(
          'For web platform, use PlaywrightActions constructor directly with a Page object'
        );
      }
      
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  static createForMobile(platform: 'ios' | 'android', capabilities?: Record<string, any>): BaseActions {
    return this.create({ platform, capabilities });
  }
}
