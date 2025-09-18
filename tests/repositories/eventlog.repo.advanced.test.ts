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

describe('EventLogRepository - Advanced Operations', () => {
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

  describe('getCount', () => {
    it('should return event count', async () => {
      const { readJsonFile } = await import('../../src/utils/fsSafe');
      vi.mocked(readJsonFile).mockResolvedValue({ events: mockEvents });

      const result = await repo.getCount();

      expect(result).toBe(2);
    });
  });

  describe('clear', () => {
    it('should clear all events', async () => {
      const { writeJsonFile } = await import('../../src/utils/fsSafe');

      await repo.clear();

      expect(writeJsonFile).toHaveBeenCalledWith(
        expect.stringContaining('event-log.json'),
        { events: [] }
      );
    });
  });

  describe('getPaginated', () => {
    it('should return paginated events', async () => {
      const { readJsonFile } = await import('../../src/utils/fsSafe');
      vi.mocked(readJsonFile).mockResolvedValue({ events: mockEvents });

      const result = await repo.getPaginated(0, 1);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockEvents[0]);
    });

    it('should handle empty results', async () => {
      const { readJsonFile } = await import('../../src/utils/fsSafe');
      vi.mocked(readJsonFile).mockResolvedValue({ events: [] });

      const result = await repo.getPaginated(0, 10);

      expect(result).toHaveLength(0);
    });
  });

  describe('getById', () => {
    it('should return event by ID', async () => {
      const { readJsonFile } = await import('../../src/utils/fsSafe');
      vi.mocked(readJsonFile).mockResolvedValue({ events: mockEvents });

      const result = await repo.getById('event-1');

      expect(result).toEqual(mockEvents[0]);
    });

    it('should return null for non-existent ID', async () => {
      const { readJsonFile } = await import('../../src/utils/fsSafe');
      vi.mocked(readJsonFile).mockResolvedValue({ events: mockEvents });

      const result = await repo.getById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should handle read errors gracefully', async () => {
      const { readJsonFile } = await import('../../src/utils/fsSafe');
      vi.mocked(readJsonFile).mockRejectedValue(new Error('Read error'));

      const result = await repo.getAll();

      expect(result).toEqual([]);
    });

    it('should handle write errors', async () => {
      const { readJsonFile, writeJsonFile } = await import('../../src/utils/fsSafe');
      vi.mocked(readJsonFile).mockResolvedValue({ events: [] });
      vi.mocked(writeJsonFile).mockRejectedValue(new Error('Write error'));

      const newEvent: Event = {
        id: 'event-3',
        type: 'test',
        payload: {},
        ts: Date.now(),
      };

      await expect(repo.append(newEvent)).rejects.toThrow('Failed to append event event-3');
    });
  });
});
