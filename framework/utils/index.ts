export {
  id,
  text,
  label,
  xpath,
  css,
  className,
  parseSelector,
  isPlatformSelector,
  resolvePlatformSelector,
  isChainableSelector,
  ChainableSelector,
  platform,
  by,
} from "./SelectorBuilder";

export type { SelectorType } from "./SelectorBuilder";

export { TestContext } from "./testContext";
export { ScreenRecorder, createScreenRecorder, getScreenRecorder } from "./screenRecorder";
export { mobileConfig, MobileConfigLoader } from "./mobileConfig";
export { unifiedConfig, UnifiedConfigLoader } from "./unifiedConfig";
