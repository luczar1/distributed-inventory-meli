import { logger } from '../core/logger';
import { SyncState } from './sync.worker.types';

export class SyncWorkerState {
  private state: SyncState = {
    isRunning: false,
  };

  /**
   * Get current state
   */
  getState(): SyncState {
    return { ...this.state };
  }

  /**
   * Start periodic sync with specified interval
   */
  startSync(intervalMs: number, syncCallback: () => Promise<void>): void {
    if (this.state.isRunning) {
      logger.warn('Sync worker is already running');
      return;
    }

    this.state.isRunning = true;
    this.state.intervalId = setInterval(async () => {
      try {
        await syncCallback();
      } catch (error) {
        logger.error({ error }, 'Error during periodic sync');
      }
    }, intervalMs);

    logger.info({ intervalMs }, 'Sync worker started');
  }

  /**
   * Stop periodic sync
   */
  stopSync(): void {
    if (!this.state.isRunning) {
      logger.warn('Sync worker is not running');
      return;
    }

    if (this.state.intervalId) {
      clearInterval(this.state.intervalId);
      this.state.intervalId = undefined;
    }

    this.state.isRunning = false;
    logger.info('Sync worker stopped');
  }

  /**
   * Check if sync worker is running
   */
  isRunning(): boolean {
    return this.state.isRunning;
  }

  /**
   * Set last processed event ID
   */
  setLastProcessedEventId(eventId: string): void {
    this.state.lastProcessedEventId = eventId;
  }

  /**
   * Get last processed event ID
   */
  getLastProcessedEventId(): string | undefined {
    return this.state.lastProcessedEventId;
  }

  /**
   * Reset state
   */
  reset(): void {
    this.state = {
      isRunning: false,
    };
  }
}
