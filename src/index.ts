/**
 * OmniAutoTest framework entry point.
 *
 * Intentionally driver-agnostic: this barrel only re-exports the shared
 * contracts and utilities. Concrete drivers (e.g. Detox, Appium) live under
 * `adapters/<driver>/` and are imported directly from there, so adding a new
 * framework never requires editing this file.
 *
 *   import { IAppLauncher, IActions, Logger } from '@omni';
 *   import { detoxAppLauncher } from '@adapters/detox';
 */

// Driver-agnostic contracts (element actions + app-launch contract).
export * from './contracts';

// Utilities (logger, …).
export * from './utils';
