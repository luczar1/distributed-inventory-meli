import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EventLogRepository, Event } from '../../src/repositories/eventlog.repo';

// Mock fsSafe utilities
vi.mock('../../src/utils/fsSafe', () => ({
  readJsonFile: vi.fn(),
  writeJsonFile: vi.fn(),
  ensureDir: vi.fn(),
}));

vi.mock('../../src/core/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('EventLogRepository - Basic Operations', () => {
  let repo: EventLogRepository;
  let mockEvents: Event[];

  beforeEach(() => {
    repo = new EventLogRepository();
    mockEvents = [
      {
        id: 'event-1',
        type: 'inventory_created',
        payload: { sku: 'SKU123', storeId: 'STORE001' },
        ts: 1640995200000,
      },
      {
        id: 'event-2',
        type: 'inventory_updated',
        payload: { sku: 'SKU123', storeId: 'STORE001', qty: 100 },
        ts: 1640995260000,
      },
    ];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('append', () => {
    it('should append new event', async () => {
      const { readJsonFile, writeJsonFile } = await import('../../src/utils/fsSafe');
      vi.mocked(readJsonFile).mockResolvedValue({ events: [] });
      
      const newEvent: Event = {
        id: 'event-3',
        type: 'inventory_deleted',
        payload: { sku: 'SKU123', storeId: 'STORE001' },
        ts: Date.now(),
      };

      await repo.append(newEvent);

      expect(writeJsonFile).toHaveBeenCalledWith(
        expect.stringContaining('event-log.json'),
        {
          events: [newEvent],
          lastId: 'event-3',
          lastSequence: 1,
        }
      );
    });

    it('should skip duplicate event (idempotency)', async () => {
      const { readJsonFile, writeJsonFile } = await import('../../src/utils/fsSafe');
      vi.mocked(readJsonFile).mockResolvedValue({ events: mockEvents });
      
      const duplicateEvent: Event = {
        id: 'event-1',
        type: 'inventory_created',
        payload: { sku: 'SKU123', storeId: 'STORE001' },
        ts: 1640995200000,
      };

      await repo.append(duplicateEvent);

      expect(writeJsonFile).not.toHaveBeenCalled();
    });
  });

  describe('getAll', () => {
    it('should return all events', async () => {
      const { readJsonFile } = await import('../../src/utils/fsSafe');
      vi.mocked(readJsonFile).mockResolvedValue({ events: mockEvents });

      const result = await repo.getAll();

      expect(result).toEqual(mockEvents);
    });
  });

  describe('getByType', () => {
    it('should return events of specific type', async () => {
      const { readJsonFile } = await import('../../src/utils/fsSafe');
      vi.mocked(readJsonFile).mockResolvedValue({ events: mockEvents });

      const result = await repo.getByType('inventory_created');

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('inventory_created');
    });
  });

  describe('getByTimeRange', () => {
    it('should return events within time range', async () => {
      const { readJsonFile } = await import('../../src/utils/fsSafe');
      vi.mocked(readJsonFile).mockResolvedValue({ events: mockEvents });

      const result = await repo.getByTimeRange(1640995200000, 1640995300000);

      expect(result).toHaveLength(2);
    });

    it('should return empty array for no matches', async () => {
      const { readJsonFile } = await import('../../src/utils/fsSafe');
      vi.mocked(readJsonFile).mockResolvedValue({ events: mockEvents });

      const result = await repo.getByTimeRange(1640996000000, 1640997000000);

      expect(result).toHaveLength(0);
    });
  });

  describe('getLastId', () => {
    it('should return last event ID', async () => {
      const { readJsonFile } = await import('../../src/utils/fsSafe');
      vi.mocked(readJsonFile).mockResolvedValue({ events: mockEvents, lastId: 'event-2' });

      const result = await repo.getLastId();

      expect(result).toBe('event-2');
    });

    it('should return null when no events', async () => {
      const { readJsonFile } = await import('../../src/utils/fsSafe');
      vi.mocked(readJsonFile).mockResolvedValue({ events: [] });

      const result = await repo.getLastId();

      expect(result).toBeNull();
    });
  });
});
