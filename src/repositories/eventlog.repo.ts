import { join } from 'path';
import { readJsonFile, writeJsonFile, ensureDir } from '../utils/fsSafe';
import { logger } from '../core/logger';

// Event structure
export interface Event {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  ts: number;
}

// Event log data structure
interface EventLogData {
  events: Event[];
  lastId?: string;
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
      
      data.events.push(event);
      data.lastId = event.id;
      
      await this.saveData(data);
      logger.info({ eventId: event.id, type: event.type }, 'Event appended to log');
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
}

// Global instance
export const eventLogRepository = new EventLogRepository();
