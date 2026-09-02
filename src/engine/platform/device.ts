/**
 * VYTHERA ENGINE — Platform capability detection.
 *
 * Pure functions over navigator/window. No game imports. Everything is
 * defensive: unknown environments degrade to conservative (low-power) answers
 * rather than throwing.
 */

export type DeviceClass = 'low-mobile' | 'mobile' | 'desktop';

/**
 * True for phones/tablets that need on-screen controls.
 * Touch laptops with a fine pointer keep keyboard/mouse + pointer-lock.
 */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(pointer: coarse)').matches) return true;
  if (window.matchMedia('(hover: none)').matches && navigator.maxTouchPoints > 0) return true;
  return false;
}

export interface DeviceCapabilities {
  readonly deviceMemoryGB: number | null;
  readonly hardwareConcurrency: number | null;
  readonly touch: boolean;
  readonly deviceClass: DeviceClass;
}

/** Best-effort hardware probe; every field may be null when the API is absent. */
export function detectDeviceCapabilities(): DeviceCapabilities {
  let memory: number | null = null;
  let cores: number | null = null;
  if (typeof navigator !== 'undefined') {
    const nav = navigator as unknown as { deviceMemory?: number; hardwareConcurrency?: number };
    if (typeof nav.deviceMemory === 'number') memory = nav.deviceMemory;
    if (typeof nav.hardwareConcurrency === 'number') cores = nav.hardwareConcurrency;
  }
  const touch = isTouchDevice();

  let deviceClass: DeviceClass = 'desktop';
  if (touch || (memory !== null && memory <= 4)) {
    deviceClass = memory !== null && memory <= 2 ? 'low-mobile' : 'mobile';
    if (deviceClass === 'mobile' && memory === null && cores !== null && cores <= 4 && touch) {
      deviceClass = 'low-mobile';
    }
  }

  return { deviceMemoryGB: memory, hardwareConcurrency: cores, touch, deviceClass };
}
