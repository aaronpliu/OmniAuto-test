/**
 * Driver bootstrap. Importing this module (for its `getDriver` re-export) also
 * imports `@adapters`, which registers every available driver via
 * `registerDriver`. This guarantees the registry is populated before any
 * `getDriver()` call — pages and tests should import `getDriver` from here,
 * not directly from `@core/Driver`.
 */
import '@adapters';

export {
  getDriver,
  registerDriver,
  type IDriver,
  type DriverName,
} from './Driver';
