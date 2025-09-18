import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SyncWorker } from '../../src/workers/sync.worker';
import { Event } from '../../src/repositories/eventlog.repo';

// Mock dependencies
vi.mock('../../src/repositories/eventlog.repo', () => ({
  eventLogRepository: {
    getAll: vi.fn(),
    getAfterSequence: vi.fn(),
  },
}));

vi.mock('../../src/utils/fsSafe', () => ({
  readJsonFile: vi.fn(),
  writeJsonFile: vi.fn(),
  ensureDir: vi.fn(),
}));

vi.mock('../../src/core/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('SyncWorker - Event Processing', () => {
  let syncWorker: SyncWorker;
  let mockEvents: Event[];

  beforeEach(() => {
    syncWorker = new SyncWorker();
    mockEvents = [
      {
        id: 'event-1',
        type: 'stock_adjusted',
        payload: {
          sku: 'SKU123',
          storeId: 'STORE001',
          delta: 50,
          previousQty: 100,
          newQty: 150,
          previousVersion: 1,
          newVersion: 2,
        },
        ts: 1640995200000,
      },
      {
        id: 'event-2',
        type: 'stock_reserved',
        payload: {
          sku: 'SKU123',
          storeId: 'STORE001',
          reservedQty: 30,
          previousQty: 150,
          newQty: 120,
          previousVersion: 2,
          newVersion: 3,
        },
        ts: 1640995260000,
      },
    ];
  });

  afterEach(() => {
    vi.clearAllMocks();
    syncWorker.resetState();
  });

  describe('event processing', () => {
    it('should process stock adjustment events', async () => {
      const { eventLogRepository } = await import('../../src/repositories/eventlog.repo');
      const { readJsonFile, writeJsonFile } = await import('../../src/utils/fsSafe');
      
      vi.mocked(eventLogRepository.getAll).mockResolvedValue([mockEvents[0]]);
      vi.mocked(readJsonFile).mockResolvedValue({});
      vi.mocked(writeJsonFile).mockResolvedValue();

      await syncWorker.syncOnce();

      expect(writeJsonFile).toHaveBeenCalledWith(
        expect.stringContaining('central-inventory.json'),
        expect.objectContaining({
          'SKU123': {
            'STORE001': 150,
          },
        })
      );
    });

    it('should process stock reservation events', async () => {
      const { eventLogRepository } = await import('../../src/repositories/eventlog.repo');
      const { readJsonFile, writeJsonFile } = await import('../../src/utils/fsSafe');
      
      vi.mocked(eventLogRepository.getAll).mockResolvedValue([mockEvents[1]]);
      vi.mocked(readJsonFile).mockResolvedValue({});
      vi.mocked(writeJsonFile).mockResolvedValue();

      await syncWorker.syncOnce();

      expect(writeJsonFile).toHaveBeenCalledWith(
        expect.stringContaining('central-inventory.json'),
        expect.objectContaining({
          'SKU123': {
            'STORE001': 120,
          },
        })
      );
    });

    it('should handle unknown event types', async () => {
      const { eventLogRepository } = await import('../../src/repositories/eventlog.repo');
      const { readJsonFile, writeJsonFile } = await import('../../src/utils/fsSafe');
      
      const unknownEvent: Event = {
        id: 'event-unknown',
        type: 'unknown_event',
        payload: { sku: 'SKU123', storeId: 'STORE001' },
        ts: 1640995200000,
      };

      vi.mocked(eventLogRepository.getAll).mockResolvedValue([unknownEvent]);
      vi.mocked(readJsonFile).mockResolvedValue({});
      vi.mocked(writeJsonFile).mockResolvedValue();

      await syncWorker.syncOnce();

      // Test passes if no error is thrown
      expect(eventLogRepository.getAll).toHaveBeenCalled();
    });

    it('should initialize new inventory records', async () => {
      const { eventLogRepository } = await import('../../src/repositories/eventlog.repo');
      const { readJsonFile, writeJsonFile } = await import('../../src/utils/fsSafe');
      
      vi.mocked(eventLogRepository.getAll).mockResolvedValue([mockEvents[0]]);
      vi.mocked(readJsonFile).mockResolvedValue({});
      vi.mocked(writeJsonFile).mockResolvedValue();

      await syncWorker.syncOnce();

      expect(writeJsonFile).toHaveBeenCalledWith(
        expect.stringContaining('central-inventory.json'),
        expect.objectContaining({
          'SKU123': {
            'STORE001': 150,
          },
        })
      );
    });
  });

  describe('incremental processing', () => {
    it('should only process new events after first sync', async () => {
      const { eventLogRepository } = await import('../../src/repositories/eventlog.repo');
      const { readJsonFile, writeJsonFile } = await import('../../src/utils/fsSafe');
      
      // First sync
      vi.mocked(eventLogRepository.getAll).mockResolvedValue(mockEvents);
      vi.mocked(readJsonFile).mockResolvedValue({});
      vi.mocked(writeJsonFile).mockResolvedValue();

      await syncWorker.syncOnce();

      // Second sync with same events - mock getAfterSequence to return empty array
      vi.mocked(eventLogRepository.getAfterSequence).mockResolvedValue([]);
      vi.mocked(writeJsonFile).mockClear();

      await syncWorker.syncOnce();

      // Should not write again since no new events
      expect(writeJsonFile).not.toHaveBeenCalled();
    });

    it('should process only new events in subsequent syncs', async () => {
      const { eventLogRepository } = await import('../../src/repositories/eventlog.repo');
      const { readJsonFile, writeJsonFile } = await import('../../src/utils/fsSafe');
      
      // First sync
      vi.mocked(eventLogRepository.getAll).mockResolvedValue([mockEvents[0]]);
      vi.mocked(readJsonFile).mockResolvedValue({});
      vi.mocked(writeJsonFile).mockResolvedValue();

      await syncWorker.syncOnce();

      // Second sync with additional event
      const newEvent: Event = {
        id: 'event-3',
        type: 'stock_adjusted',
        payload: {
          sku: 'SKU456',
          storeId: 'STORE002',
          delta: 25,
          previousQty: 0,
          newQty: 25,
          previousVersion: 0,
          newVersion: 1,
        },
        ts: 1640995320000,
      };

      // Mock getAfterSequence to return the new event
      vi.mocked(eventLogRepository.getAfterSequence).mockResolvedValue([newEvent]);
      vi.mocked(writeJsonFile).mockClear();

      await syncWorker.syncOnce();

      expect(writeJsonFile).toHaveBeenCalled();
    });
  });
});
