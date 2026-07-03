import { Logger } from "../utils/logger";

const logger = Logger.getInstance();

export default function apiSetup(): Promise<void> {
  logger.info("Setting up API testing environment");
  return Promise.resolve();
}
