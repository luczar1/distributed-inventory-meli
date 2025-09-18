import { join } from 'path';
import { readJsonFile, writeJsonFile, ensureDir } from '../utils/fsSafe';
import { logger } from '../core/logger';
import { Event, EventLogData } from './eventlog.types';
import { deadLetterQueue } from './eventlog.deadletter';

export class EventLogRepository {
  private readonly dataDir = 'data';
  private readonly filePath: string;

  constructor() {
    this.filePath = join(this.dataDir, 'event-log.json');
  }

  /**
   * Append an event to the log (idempotent)
   */
  async append(event: Event): Promise<void> {
    try {
      const data = await this.loadData();
      
      // Check for duplicate ID (idempotency)
      const existingEvent = data.events.find(e => e.id === event.id);
      if (existingEvent) {
        logger.info({ eventId: event.id }, 'Event already exists, skipping append');
        return;
      }
      
      // Assign sequence number if not provided
      if (event.sequence === undefined) {
        event.sequence = (data.lastSequence || 0) + 1;
      }
      
      data.events.push(event);
      data.lastId = event.id;
      data.lastSequence = event.sequence;
      
      await this.saveData(data);
      logger.info({ eventId: event.id, type: event.type, sequence: event.sequence }, 'Event appended to log');
    } catch (error) {
      logger.error({ error, event }, 'Failed to append event');
      throw new Error(`Failed to append event ${event.id}`);
    }
  }

  /**
   * Get all events
   */
  async getAll(): Promise<Event[]> {
    try {
      const data = await this.loadData();
      return data.events;
    } catch (error) {
      logger.error({ error }, 'Failed to get all events');
      throw new Error('Failed to get all events');
    }
  }

  /**
   * Get events by type
   */
  async getByType(type: string): Promise<Event[]> {
    try {
      const data = await this.loadData();
      return data.events.filter(event => event.type === type);
    } catch (error) {
      logger.error({ error, type }, 'Failed to get events by type');
      throw new Error(`Failed to get events by type ${type}`);
    }
  }

  /**
   * Get events within a time range
   */
  async getByTimeRange(startTs: number, endTs: number): Promise<Event[]> {
    try {
      const data = await this.loadData();
      return data.events.filter(event => event.ts >= startTs && event.ts <= endTs);
    } catch (error) {
      logger.error({ error, startTs, endTs }, 'Failed to get events by time range');
      throw new Error('Failed to get events by time range');
    }
  }

  /**
   * Get events after a specific sequence
   */
  async getAfterSequence(sequence: number): Promise<Event[]> {
    try {
      const data = await this.loadData();
      return data.events.filter(event => event.sequence > sequence);
    } catch (error) {
      logger.error({ error, sequence }, 'Failed to get events after sequence');
      throw new Error('Failed to get events after sequence');
    }
  }

  /**
   * Get the last event
   */
  async getLast(): Promise<Event | null> {
    try {
      const data = await this.loadData();
      return data.events.length > 0 ? data.events[data.events.length - 1] : null;
    } catch (error) {
      logger.error({ error }, 'Failed to get last event');
      throw new Error('Failed to get last event');
    }
  }

  /**
   * Get the last event ID
   */
  async getLastId(): Promise<string | null> {
    try {
      const data = await this.loadData();
      return data.lastId || null;
    } catch (error) {
      logger.error({ error }, 'Failed to get last event ID');
      throw new Error('Failed to get last event ID');
    }
  }

  /**
   * Get event by ID
   */
  async getById(id: string): Promise<Event | null> {
    try {
      const data = await this.loadData();
      return data.events.find(event => event.id === id) || null;
    } catch (error) {
      logger.error({ error, id }, 'Failed to get event by ID');
      throw new Error(`Failed to get event by ID ${id}`);
    }
  }

  /**
   * Update event retry information
   */
  async updateRetryInfo(eventId: string, retryCount: number, failureReason?: string): Promise<void> {
    try {
      const data = await this.loadData();
      const event = data.events.find(e => e.id === eventId);
      
      if (event) {
        event.retryCount = retryCount;
        event.lastFailureTs = Date.now();
        if (failureReason) {
          event.failureReason = failureReason;
        }
        
        await this.saveData(data);
        logger.info({ eventId, retryCount }, 'Event retry info updated');
      }
    } catch (error) {
      logger.error({ error, eventId }, 'Failed to update retry info');
      throw new Error(`Failed to update retry info for event ${eventId}`);
    }
  }

  /**
   * Move event to dead letter queue
   */
  async moveToDLQ(eventId: string, finalFailureReason: string): Promise<void> {
    try {
      const event = await this.getById(eventId);
      if (event) {
        await deadLetterQueue.moveToDLQ(event, finalFailureReason);
        await this.removeEvent(eventId);
      }
    } catch (error) {
      logger.error({ error, eventId }, 'Failed to move event to DLQ');
      throw new Error(`Failed to move event ${eventId} to DLQ`);
    }
  }

  /**
   * Remove an event from the log
   */
  async removeEvent(eventId: string): Promise<void> {
    try {
      const data = await this.loadData();
      const index = data.events.findIndex(e => e.id === eventId);
      
      if (index !== -1) {
        data.events.splice(index, 1);
        await this.saveData(data);
        logger.info({ eventId }, 'Event removed from log');
      }
    } catch (error) {
      logger.error({ error, eventId }, 'Failed to remove event');
      throw new Error(`Failed to remove event ${eventId}`);
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
   * Load event log data
   */
  private async loadData(): Promise<EventLogData> {
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
  private async saveData(data: EventLogData): Promise<void> {
    await ensureDir(this.dataDir);
    await writeJsonFile(this.filePath, data);
  }
}

export const eventLogRepository = new EventLogRepository();
