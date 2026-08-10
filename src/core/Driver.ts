/**
 * Driver registry / selector.
 *
 * The single switch point between automation frameworks. Pages and tests never
 * import a concrete adapter (Detox, Appium, …) directly — they call
 * {@link getDriver} and consume the driver-neutral {@link IDriver} facade
 * (`matcher` + `launcher`). The active driver is chosen by `E2E_DRIVER` env
 * (defaults to `detox`), so the same test/Page code runs under any framework.
 */
import type { IDriver, DriverName } from './IDriver';

const registry = new Map<DriverName, () => IDriver>();

/** Register a driver factory. Call once per process (e.g. from adapters/index). */
export function registerDriver(name: DriverName, factory: () => IDriver): void {
  registry.set(name, factory);
}

/** Resolve the active driver from `E2E_DRIVER` (defaults to `detox`). */
export function getDriver(name: DriverName = driverFromEnv()): IDriver {
  const factory = registry.get(name);
  if (!factory) {
    throw new Error(
      `[getDriver] unknown driver "${name}". Registered: [${[...registry.keys()].join(', ')}]`,
    );
  }
  return factory();
}

function driverFromEnv(): DriverName {
  const v = process.env.E2E_DRIVER;
  if (v && v !== 'detox' && v !== 'appium') {
    throw new Error(`[getDriver] E2E_DRIVER must be "detox" or "appium", got "${v}"`);
  }
  return (v as DriverName) ?? 'detox';
}
