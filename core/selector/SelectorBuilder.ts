/**
 * SelectorBuilder — Core wrapper
 *
 * Phase 1: Re-export from existing framework/utils/SelectorBuilder.ts
 * Phase 5: Move implementation here
 */
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
  platformSelectorToString,
  isChainableSelector,
  isIndexedSelector,
  ChainableSelector,
  platform,
  by,
} from "../../framework/utils/SelectorBuilder";

export type { SelectorType } from "../../framework/utils/SelectorBuilder";
