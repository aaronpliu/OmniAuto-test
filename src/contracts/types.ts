/**
 * Common primitive types shared across all UI element action contracts.
 *
 * These types are platform-agnostic on purpose: the Detox adapter (and any
 * future adapter) is responsible for translating them into its own vocabulary.
 */

/** A 2D point in an element's local coordinate space. */
export interface Point {
  x: number;
  y: number;
}

/** Supported swipe / scroll directions. */
export type Direction = 'left' | 'right' | 'up' | 'down';

/** Supported scroll-to edges. */
export type Edge = 'left' | 'right' | 'top' | 'bottom';

/** Gesture speed presets. */
export type GestureSpeed = 'fast' | 'slow';

/** Date formats accepted by date-picker actions. */
export type DateFormat = 'ISO8601' | string;

/**
 * Attributes describing the runtime state of a resolved UI element.
 * Mirrors Detox's `getAttributes()` payload but kept as a contract so adapters
 * can normalise platform-specific fields.
 */
export interface ElementAttributes {
  text?: string;
  label?: string;
  identifier?: string;
  value?: string;
  visible?: boolean;
  enabled?: boolean;
  frame?: { x: number; y: number; width: number; height: number };
  /** Platform-specific extras are preserved as-is. */
  [key: string]: unknown;
}
