import { Logger } from '../utils/logger';

const logger = Logger.getInstance();

export default async function apiSetup() {
  logger.info('Setting up API testing environment');
}
