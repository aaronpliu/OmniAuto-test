import { Logger } from '../utils/logger';

const logger = Logger.getInstance();

export default async function globalTeardown() {
  logger.info('=== Global Test Teardown Started ===');
  logger.info('=== Global Test Teardown Completed ===');
}
