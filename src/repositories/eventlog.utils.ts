import { join } from 'path';
import { readJsonFile, writeJsonFile, ensureDir } from '../utils/fsSafe';
import { logger } from '../core/logger';
import { EventLogData } from './eventlog.types';

export class EventLogUtils {
  private readonly dataDir: string;
  private readonly filePath: string;

  constructor() {
    // Use test data directory if in test environment
    this.dataDir = process.env.TEST_DATA_DIR || 'data';
    this.filePath = join(this.dataDir, 'event-log.json');
  }

  /**
   * Load event log data
   */
  async loadData(): Promise<EventLogData> {
    try {
      await ensureDir(this.dataDir);
      return await readJsonFile<EventLogData>(this.filePath);
    } catch (error) {
      // File doesn't exist, return empty data
      return { events: [], lastId: undefined, lastSequence: undefined };
    }
  }

  /**
   * Save event log data
   */
  async saveData(data: EventLogData): Promise<void> {
    await ensureDir(this.dataDir);
    await writeJsonFile(this.filePath, data);
  }

  /**
   * Get event log statistics
   */
  async getStats(): Promise<{
    totalEvents: number;
    eventsByType: Record<string, number>;
    oldestEvent?: number;
    newestEvent?: number;
    lastSequence?: number;
  }> {
    try {
      const data = await this.loadData();
      
      const stats = {
        totalEvents: data.events.length,
        eventsByType: {} as Record<string, number>,
        oldestEvent: undefined as number | undefined,
        newestEvent: undefined as number | undefined,
        lastSequence: data.lastSequence,
      };

      if (data.events.length === 0) {
        return stats;
      }

      // Calculate statistics
      for (const event of data.events) {
        stats.eventsByType[event.type] = (stats.eventsByType[event.type] || 0) + 1;
      }

      const timestamps = data.events.map(e => e.ts);
      stats.oldestEvent = Math.min(...timestamps);
      stats.newestEvent = Math.max(...timestamps);

      return stats;
    } catch (error) {
      logger.error({ error }, 'Failed to get event log statistics');
      throw new Error('Failed to get event log statistics');
    }
  }

  /**
   * Clear all events
   */
  async clear(): Promise<void> {
    try {
      await ensureDir(this.dataDir);
      await writeJsonFile(this.filePath, { events: [], lastId: undefined, lastSequence: undefined });
      logger.info('Event log cleared');
    } catch (error) {
      logger.error({ error }, 'Failed to clear event log');
      throw new Error('Failed to clear event log');
    }
  }
}
