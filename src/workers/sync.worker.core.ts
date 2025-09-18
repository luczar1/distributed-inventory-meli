import { eventLogRepository } from '../repositories/eventlog.repo';
import { logger } from '../core/logger';
import { EventProcessor } from './sync.worker.events';
import { SyncWorkerState } from './sync.worker.state';
import { CentralInventoryManager } from './sync.worker.inventory';
import { snapshotter } from '../ops/snapshotter';
import { syncWorkerBreaker } from '../utils/circuitBreaker';
import { syncBulkhead } from '../utils/bulkhead';

export class SyncWorker {
  private stateManager = new SyncWorkerState();
  private inventoryManager = new CentralInventoryManager();
  private eventProcessor = new EventProcessor();

  /**
   * Start periodic sync with specified interval
   */
  startSync(intervalMs: number = 15000): void {
    this.stateManager.startSync(intervalMs, () => this.syncOnce());
  }

  /**
   * Stop periodic sync
   */
  stopSync(): void {
    this.stateManager.stopSync();
  }

  /**
   * Check if sync worker is running
   */
  isRunning(): boolean {
    return this.stateManager.isRunning();
  }

  /**
   * Get sync worker status
   */
  getStatus(): {
    isRunning: boolean;
    lastProcessedEventId?: string;
  } {
    const state = this.stateManager.getState();
    return {
      isRunning: state.isRunning,
      lastProcessedEventId: state.lastProcessedEventId,
    };
  }

  /**
   * Reset sync worker state (for testing)
   */
  resetState(): void {
    this.stateManager.reset();
  }

  /**
   * Run sync once
   */
  async syncOnce(): Promise<void> {
    if (syncWorkerBreaker.isOpen()) {
      logger.warn('Sync worker circuit breaker is open, skipping sync');
      return;
    }

    return syncBulkhead.run(async () => {
      try {
        await syncWorkerBreaker.execute(async () => {
          await this.processEvents();
        });
      } catch (error) {
        logger.error({ error }, 'Sync operation failed');
        throw error;
      }
    });
  }

  /**
   * Replay event log on boot
   */
  async replayOnBoot(): Promise<void> {
    try {
      logger.info('Starting event log replay on boot');
      await this.processEvents();
      logger.info('Event log replay completed');
    } catch (error) {
      logger.error({ error }, 'Event log replay failed');
      throw error;
    }
  }

  /**
   * Process events from the event log
   */
  private async processEvents(): Promise<void> {
    try {
      const lastProcessedId = this.stateManager.getLastProcessedEventId();
      const events = lastProcessedId 
        ? await eventLogRepository.getAfterSequence(0) // Get all events for replay
        : await eventLogRepository.getAll();

      if (events.length === 0) {
        logger.debug('No events to process');
        return;
      }

      logger.info({ eventCount: events.length }, 'Processing events');

      for (const event of events) {
        try {
          await this.eventProcessor.processEvent(event, this.inventoryManager);
          this.stateManager.setLastProcessedEventId(event.id);
        } catch (error) {
          logger.error({ error, eventId: event.id }, 'Failed to process event');
          // Re-throw the error to fail the entire sync operation
          throw error;
        }
      }

      // Create snapshot if needed
      const centralInventory = await this.inventoryManager.loadCentralInventory();
      await snapshotter.maybeSnapshot(events, centralInventory);
      
      logger.info({ processedEvents: events.length }, 'Events processed successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to process events');
      throw error;
    }
  }
}

export const syncWorker = new SyncWorker();
