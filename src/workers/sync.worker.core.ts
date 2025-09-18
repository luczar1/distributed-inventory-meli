import { join } from 'path';
import { readJsonFile, writeJsonFile, ensureDir } from '../utils/fsSafe';
import { eventLogRepository } from '../repositories/eventlog.repo';
import { logger } from '../core/logger';
import { CentralInventory, SyncState } from './sync.worker.types';
import { EventProcessor } from './sync.worker.events';

export class SyncWorker {
  private readonly dataDir = 'data';
  private readonly centralInventoryPath: string;
  private state: SyncState = {
    isRunning: false,
  };
  private eventProcessor = new EventProcessor();

  constructor() {
    this.centralInventoryPath = join(this.dataDir, 'central-inventory.json');
  }

  /**
   * Start periodic sync with specified interval
   */
  startSync(intervalMs: number = 15000): void {
    if (this.state.isRunning) {
      logger.warn('Sync worker is already running');
      return;
    }

    this.state.isRunning = true;
    this.state.intervalId = setInterval(async () => {
      try {
        await this.syncOnce();
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
   * Perform a single sync operation
   */
  async syncOnce(): Promise<void> {
    try {
      logger.info('Starting sync operation');
      await this.applyEventsToCentral();
      logger.info('Sync operation completed successfully');
    } catch (error) {
      logger.error({ error }, 'Sync operation failed');
      throw error;
    }
  }

  /**
   * Apply new events to central inventory
   */
  private async applyEventsToCentral(): Promise<void> {
    try {
      // Get all events
      const events = await eventLogRepository.getAll();
      
      if (events.length === 0) {
        logger.debug('No events to process');
        return;
      }

      // Filter events that haven't been processed yet
      const newEvents = this.eventProcessor.getNewEvents(events, this.state.lastProcessedEventId);
      
      if (newEvents.length === 0) {
        logger.debug('No new events to process');
        return;
      }

      logger.info({ count: newEvents.length }, 'Processing new events');

      // Load current central inventory
      const centralInventory = await this.loadCentralInventory();

      // Apply events to central inventory
      for (const event of newEvents) {
        await this.eventProcessor.applyEventToCentral(centralInventory, event);
      }

      // Save updated central inventory
      await this.saveCentralInventory(centralInventory);

      // Update last processed event ID
      this.state.lastProcessedEventId = newEvents[newEvents.length - 1].id;

      logger.info({ 
        processedCount: newEvents.length,
        lastEventId: this.state.lastProcessedEventId 
      }, 'Events applied to central inventory');

    } catch (error) {
      logger.error({ error }, 'Failed to apply events to central inventory');
      throw error;
    }
  }

  /**
   * Load central inventory from file
   */
  private async loadCentralInventory(): Promise<CentralInventory> {
    try {
      await ensureDir(this.dataDir);
      const data = await readJsonFile<CentralInventory>(this.centralInventoryPath);
      return data || {};
    } catch (error) {
      logger.warn({ error, filePath: this.centralInventoryPath }, 'Failed to load central inventory, returning empty data');
      return {};
    }
  }

  /**
   * Save central inventory to file
   */
  private async saveCentralInventory(inventory: CentralInventory): Promise<void> {
    await ensureDir(this.dataDir);
    await writeJsonFile(this.centralInventoryPath, inventory);
  }

  /**
   * Get sync worker status
   */
  getStatus(): { isRunning: boolean; lastProcessedEventId?: string } {
    return {
      isRunning: this.state.isRunning,
      lastProcessedEventId: this.state.lastProcessedEventId,
    };
  }

  /**
   * Reset sync state (for testing)
   */
  resetState(): void {
    this.state = {
      isRunning: false,
    };
    logger.info('Sync worker state reset');
  }
}

// Singleton instance
export const syncWorker = new SyncWorker();
