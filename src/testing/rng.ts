/**
 * Deterministic RNG utilities for testing
 */

let _rng: () => number = Math.random;

/**
 * Set a deterministic random number generator for testing
 * @param fn Function that returns a number between 0 and 1
 */
export function setDeterministicRng(fn: () => number): void {
  _rng = fn;
}

/**
 * Get the current RNG function
 */
export function getRng(): () => number {
  return _rng;
}

/**
 * Reset to default Math.random
 */
export function resetRng(): void {
  _rng = Math.random;
}

/**
 * Generate a random number using the current RNG
 */
export function random(): number {
  return _rng();
}

/**
 * Generate a random integer between min and max (inclusive)
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(_rng() * (max - min + 1)) + min;
}

/**
 * Generate a random float between min and max
 */
export function randomFloat(min: number, max: number): number {
  return _rng() * (max - min) + min;
}

