/**
 * Pure mappings from Tedee values to legal HomeKit characteristic values.
 * HomeKit ranges: LockCurrentState 0-3, LockTargetState 0-1, BatteryLevel 0-100.
 */

export const CURRENT_UNSECURED = 0;
export const CURRENT_SECURED = 1;
export const CURRENT_JAMMED = 2;
export const CURRENT_UNKNOWN = 3;

export const TARGET_UNSECURED = 0;
export const TARGET_SECURED = 1;

/** Tedee reports 255 when the battery level is unknown. */
export const BATTERY_LEVEL_UNKNOWN = 255;

/**
 * Maps a Tedee lock state to LockCurrentState (0-3).
 */
export function mapCurrentState(state: number, isJammed: boolean): number {
  if (isJammed) {
    return CURRENT_JAMMED;
  }

  switch (state) {
    case 0: // Uncalibrated
    case 1: // Calibrating
      return CURRENT_JAMMED;
    case 2: // Open
    case 5: // Closing
    case 7: // Pull spring
    case 8: // Pulling
    case 255: // Unpulling
      return CURRENT_UNSECURED;
    case 3: // Partially open
    case 4: // Opening
    case 6: // Closed
      return CURRENT_SECURED;
    case 9: // Unknown
    default:
      return CURRENT_UNKNOWN;
  }
}

/**
 * Maps a Tedee lock state to LockTargetState (only 0 or 1 are legal).
 * Returns undefined when the state gives no direction (jammed, uncalibrated,
 * calibrating, unknown); the caller then keeps the last legal target.
 */
export function mapTargetState(state: number, isJammed: boolean): number | undefined {
  if (isJammed) {
    return undefined;
  }

  switch (state) {
    case 2: // Open
    case 4: // Opening
    case 7: // Pull spring
    case 8: // Pulling
    case 255: // Unpulling
      return TARGET_UNSECURED;
    case 3: // Partially open
    case 5: // Closing
    case 6: // Closed
      return TARGET_SECURED;
    default: // Uncalibrated, calibrating, unknown
      return undefined;
  }
}

/**
 * Returns true when the Tedee battery level is a real percentage (0-100).
 * Rejects 255 (unknown) and any other out of range or non-numeric value.
 */
export function isValidBatteryLevel(level: unknown): level is number {
  return typeof level === 'number' && Number.isFinite(level) && level >= 0 && level <= 100;
}

/**
 * Returns the battery level to publish: the new level when valid, otherwise the last known one.
 */
export function resolveBatteryLevel(level: unknown, lastKnown: number): number {
  return isValidBatteryLevel(level) ? Math.round(level) : lastKnown;
}
