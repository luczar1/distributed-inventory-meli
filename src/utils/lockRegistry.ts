import { LockHandle } from './lockFile';
import { logger } from '../core/logger';

/**
 * Registry to track active lock handles for graceful shutdown
 */
class LockRegistry {
  private activeLocks: Set<LockHandle> = new Set();

  /**
   * Register an active lock handle
   */
  register(handle: LockHandle): void {
    this.activeLocks.add(handle);
    logger.debug({ key: handle.key, owner: handle.owner }, 'Lock registered for tracking');
  }

  /**
   * Unregister a lock handle (when released)
   */
  unregister(handle: LockHandle): void {
    this.activeLocks.delete(handle);
    logger.debug({ key: handle.key, owner: handle.owner }, 'Lock unregistered from tracking');
  }

  /**
   * Get all active lock handles
   */
  getActiveLocks(): LockHandle[] {
    return Array.from(this.activeLocks);
  }

  /**
   * Get count of active locks
   */
  getActiveLockCount(): number {
    return this.activeLocks.size;
  }

  /**
   * Clear all registered locks (for testing)
   */
  clear(): void {
    this.activeLocks.clear();
    logger.debug('Lock registry cleared');
  }

  /**
   * Check if a specific lock is registered
   */
  isRegistered(handle: LockHandle): boolean {
    return this.activeLocks.has(handle);
  }
}

// Global lock registry instance
export const lockRegistry = new LockRegistry();
