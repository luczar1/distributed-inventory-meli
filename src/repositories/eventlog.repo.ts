import { join } from 'path';
import { readJsonFile, writeJsonFile, ensureDir } from '../utils/fsSafe';
import { logger } from '../core/logger';

// Event structure
export interface Event {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  ts: number;
  sequence: number;
  retryCount?: number;
  lastFailureTs?: number;
  failureReason?: string;
}

// Dead letter event structure
export interface DeadLetterEvent {
  originalEvent: Event;
  dlqTs: number;
  finalFailureReason: string;
  totalRetries: number;
}

// Event log data structure
interface EventLogData {
  events: Event[];
  lastId?: string;
  lastSequence?: number;
}

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
      return data.events.filter(event => 
        event.ts >= startTs && event.ts <= endTs
      );
    } catch (error) {
      logger.error({ error, startTs, endTs }, 'Failed to get events by time range');
      throw new Error('Failed to get events by time range');
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
   * Get event count
   */
  async getCount(): Promise<number> {
    try {
      const data = await this.loadData();
      return data.events.length;
    } catch (error) {
      logger.error({ error }, 'Failed to get event count');
      throw new Error('Failed to get event count');
    }
  }

  /**
   * Clear all events
   */
  async clear(): Promise<void> {
    try {
      const data: EventLogData = { events: [] };
      await this.saveData(data);
      logger.info('Event log cleared');
    } catch (error) {
      logger.error({ error }, 'Failed to clear event log');
      throw new Error('Failed to clear event log');
    }
  }

  /**
   * Load event log data from file
   */
  private async loadData(): Promise<EventLogData> {
    try {
      await ensureDir(this.dataDir);
      const data = await readJsonFile<EventLogData>(this.filePath);
      return data || { events: [] };
    } catch (error) {
      logger.warn({ error, filePath: this.filePath }, 'Failed to load event log data, returning empty data');
      return { events: [] };
    }
  }

  /**
   * Save event log data to file
   */
  private async saveData(data: EventLogData): Promise<void> {
    await ensureDir(this.dataDir);
    await writeJsonFile(this.filePath, data);
  }

  /**
   * Get events with pagination
   */
  async getPaginated(offset: number, limit: number): Promise<Event[]> {
    try {
      const data = await this.loadData();
      return data.events.slice(offset, offset + limit);
    } catch (error) {
      logger.error({ error, offset, limit }, 'Failed to get paginated events');
      throw new Error('Failed to get paginated events');
    }
  }

  /**
   * Get events by ID (for verification)
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
   * Record a failure for an event
   */
  async recordFailure(eventId: string, reason: string): Promise<void> {
    try {
      const data = await this.loadData();
      const event = data.events.find(e => e.id === eventId);
      if (event) {
        event.retryCount = (event.retryCount || 0) + 1;
        event.lastFailureTs = Date.now();
        event.failureReason = reason;
        await this.saveData(data);
        logger.warn({ eventId, retryCount: event.retryCount, reason }, 'Event failure recorded');
      }
    } catch (error) {
      logger.error({ error, eventId, reason }, 'Failed to record event failure');
      throw new Error(`Failed to record failure for event ${eventId}`);
    }
  }

  /**
   * Get events that have failed and need retry
   */
  async getFailedEvents(maxRetries: number = 3): Promise<Event[]> {
    try {
      const data = await this.loadData();
      return data.events.filter(event => 
        event.retryCount !== undefined && 
        event.retryCount > 0 && 
        event.retryCount < maxRetries
      );
    } catch (error) {
      logger.error({ error, maxRetries }, 'Failed to get failed events');
      throw new Error('Failed to get failed events');
    }
  }

  /**
   * Move event to dead letter queue
   */
  async moveToDeadLetter(eventId: string, finalReason: string): Promise<void> {
    try {
      const data = await this.loadData();
      const eventIndex = data.events.findIndex(e => e.id === eventId);
      if (eventIndex === -1) {
        throw new Error(`Event ${eventId} not found`);
      }

      const event = data.events[eventIndex];
      const deadLetterEvent: DeadLetterEvent = {
        originalEvent: event,
        dlqTs: Date.now(),
        finalFailureReason: finalReason,
        totalRetries: event.retryCount || 0
      };

      // Remove from main log
      data.events.splice(eventIndex, 1);
      await this.saveData(data);

      // Append to dead letter queue
      await this.appendToDeadLetter(deadLetterEvent);
      
      logger.error({ eventId, totalRetries: deadLetterEvent.totalRetries, finalReason }, 'Event moved to dead letter queue');
    } catch (error) {
      logger.error({ error, eventId, finalReason }, 'Failed to move event to dead letter queue');
      throw new Error(`Failed to move event ${eventId} to dead letter queue`);
    }
  }

  /**
   * Append event to dead letter queue
   */
  private async appendToDeadLetter(deadLetterEvent: DeadLetterEvent): Promise<void> {
    try {
      const dlqPath = join(this.dataDir, 'dead-letter.json');
      const existingData = await readJsonFile<DeadLetterEvent[]>(dlqPath) || [];
      existingData.push(deadLetterEvent);
      await writeJsonFile(dlqPath, existingData);
      logger.info({ eventId: deadLetterEvent.originalEvent.id }, 'Event appended to dead letter queue');
    } catch (error) {
      logger.error({ error, deadLetterEvent }, 'Failed to append to dead letter queue');
      throw new Error('Failed to append to dead letter queue');
    }
  }

  /**
   * Get dead letter events
   */
  async getDeadLetterEvents(): Promise<DeadLetterEvent[]> {
    try {
      const dlqPath = join(this.dataDir, 'dead-letter.json');
      return await readJsonFile<DeadLetterEvent[]>(dlqPath) || [];
    } catch (error) {
      logger.error({ error }, 'Failed to get dead letter events');
      throw new Error('Failed to get dead letter events');
    }
  }

  /**
   * Clear dead letter queue
   */
  async clearDeadLetterQueue(): Promise<void> {
    try {
      const dlqPath = join(this.dataDir, 'dead-letter.json');
      await writeJsonFile(dlqPath, []);
      logger.info('Dead letter queue cleared');
    } catch (error) {
      logger.error({ error }, 'Failed to clear dead letter queue');
      throw new Error('Failed to clear dead letter queue');
    }
  }
}

// Global instance
export const eventLogRepository = new EventLogRepository();
