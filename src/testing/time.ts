import { vi } from 'vitest';

/**
 * Freeze the system time to a specific date for deterministic testing
 * @param dateIso ISO date string to freeze time to
 */
export function freezeNow(dateIso = '2025-01-01T00:00:00Z'): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(dateIso));
}

/**
 * Restore real timers after testing
 */
export function restoreNow(): void {
  vi.useRealTimers();
}

/**
 * Advance fake time by specified milliseconds
 * @param ms Milliseconds to advance
 */
export function advanceTime(ms: number): void {
  vi.advanceTimersByTime(ms);
}

/**
 * Get current fake time as Date
 */
export function getFakeTime(): Date {
  return new Date(vi.getSystemTime());
}

