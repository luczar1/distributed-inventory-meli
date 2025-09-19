import { join } from 'path';
import { readJsonFile, writeJsonFile, ensureDir } from '../utils/fsSafe';
import { logger } from '../core/logger';
import { Event, DeadLetterEvent } from './eventlog.types';

export class DeadLetterQueue {
  private get dataDir(): string {
    // Use test data directory if in test environment
    return process.env.TEST_DATA_DIR || 'data';
  }

  private get filePath(): string {
    return join(this.dataDir, 'dead-letter.json');
  }

  /**
   * Move an event to the dead letter queue
   */
  async moveToDLQ(event: Event, finalFailureReason: string): Promise<void> {
    try {
      await ensureDir(this.dataDir);
      
      const dlqEvent: DeadLetterEvent = {
        originalEvent: event,
        dlqTs: Date.now(),
        finalFailureReason,
        totalRetries: event.retryCount || 0,
      };

      // Load existing DLQ data
      let dlqData: DeadLetterEvent[] = [];
      try {
        dlqData = await readJsonFile<DeadLetterEvent[]>(this.filePath);
      } catch (error) {
        // File doesn't exist, start with empty array
        logger.info('Creating new dead letter queue file');
      }

      // Append to DLQ
      dlqData.push(dlqEvent);

      // Write atomically
      await writeJsonFile(this.filePath, dlqData);

      logger.warn({
        eventId: event.id,
        eventType: event.type,
        totalRetries: dlqEvent.totalRetries,
        finalFailureReason,
      }, 'Event moved to dead letter queue');
    } catch (error) {
      logger.error({ error, eventId: event.id }, 'Failed to move event to DLQ');
      throw error;
    }
  }

  /**
   * Get all events in the dead letter queue
   */
  async getDLQEvents(): Promise<DeadLetterEvent[]> {
    try {
      return await readJsonFile<DeadLetterEvent[]>(this.filePath);
    } catch (error) {
      logger.info('No dead letter queue file found, returning empty array');
      return [];
    }
  }

  /**
   * Clear the dead letter queue
   */
  async clearDLQ(): Promise<void> {
    try {
      await writeJsonFile(this.filePath, []);
      logger.info('Dead letter queue cleared');
    } catch (error) {
      logger.error({ error }, 'Failed to clear dead letter queue');
      throw error;
    }
  }

  /**
   * Get DLQ statistics
   */
  async getDLQStats(): Promise<{
    totalEvents: number;
    eventsByType: Record<string, number>;
    oldestEvent?: number;
    newestEvent?: number;
  }> {
    try {
      const events = await this.getDLQEvents();
      
      const stats = {
        totalEvents: events.length,
        eventsByType: {} as Record<string, number>,
        oldestEvent: undefined as number | undefined,
        newestEvent: undefined as number | undefined,
      };

      if (events.length === 0) {
        return stats;
      }

      // Calculate statistics
      for (const dlqEvent of events) {
        const eventType = dlqEvent.originalEvent.type;
        stats.eventsByType[eventType] = (stats.eventsByType[eventType] || 0) + 1;
      }

      const timestamps = events.map(e => e.dlqTs);
      stats.oldestEvent = Math.min(...timestamps);
      stats.newestEvent = Math.max(...timestamps);

      return stats;
    } catch (error) {
      logger.error({ error }, 'Failed to get DLQ statistics');
      throw error;
    }
  }
}

export const deadLetterQueue = new DeadLetterQueue();
