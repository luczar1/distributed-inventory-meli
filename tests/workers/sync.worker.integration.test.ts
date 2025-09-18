import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SyncWorker } from '../../src/workers/sync.worker';
import { Event } from '../../src/repositories/eventlog.repo';

// Mock dependencies
vi.mock('../../src/repositories/eventlog.repo', () => ({
  eventLogRepository: {
    getAll: vi.fn(),
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

describe('SyncWorker - Integration Tests', () => {
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
      {
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
      },
    ];
  });

  afterEach(() => {
    vi.clearAllMocks();
    syncWorker.resetState();
  });

  describe('full sync workflow', () => {
    it('should process multiple events across different stores', async () => {
      const { eventLogRepository } = await import('../../src/repositories/eventlog.repo');
      const { readJsonFile, writeJsonFile } = await import('../../src/utils/fsSafe');
      
      vi.mocked(eventLogRepository.getAll).mockResolvedValue(mockEvents);
      vi.mocked(readJsonFile).mockResolvedValue({});
      vi.mocked(writeJsonFile).mockResolvedValue();

      await syncWorker.syncOnce();

      expect(writeJsonFile).toHaveBeenCalledWith(
        expect.stringContaining('central-inventory.json'),
        expect.objectContaining({
          'STORE001': {
            'SKU123': expect.objectContaining({
              sku: 'SKU123',
              storeId: 'STORE001',
              qty: 120,
              version: 3,
            }),
          },
          'STORE002': {
            'SKU456': expect.objectContaining({
              sku: 'SKU456',
              storeId: 'STORE002',
              qty: 25,
              version: 1,
            }),
          },
        })
      );
    });

    it('should handle existing central inventory', async () => {
      const { eventLogRepository } = await import('../../src/repositories/eventlog.repo');
      const { readJsonFile, writeJsonFile } = await import('../../src/utils/fsSafe');
      
      const existingInventory = {
        'STORE001': {
          'SKU123': {
            sku: 'SKU123',
            storeId: 'STORE001',
            qty: 100,
            version: 1,
            updatedAt: new Date('2023-01-01T00:00:00Z'),
          },
        },
      };

      vi.mocked(eventLogRepository.getAll).mockResolvedValue([mockEvents[0]]);
      vi.mocked(readJsonFile).mockResolvedValue(existingInventory);
      vi.mocked(writeJsonFile).mockResolvedValue();

      await syncWorker.syncOnce();

      expect(writeJsonFile).toHaveBeenCalledWith(
        expect.stringContaining('central-inventory.json'),
        expect.objectContaining({
          'STORE001': {
            'SKU123': expect.objectContaining({
              qty: 150,
              version: 2,
            }),
          },
        })
      );
    });

    it('should handle file read errors gracefully', async () => {
      const { eventLogRepository } = await import('../../src/repositories/eventlog.repo');
      const { readJsonFile, writeJsonFile } = await import('../../src/utils/fsSafe');
      
      vi.mocked(eventLogRepository.getAll).mockResolvedValue(mockEvents);
      vi.mocked(readJsonFile).mockRejectedValue(new Error('File read error'));
      vi.mocked(writeJsonFile).mockResolvedValue();

      await syncWorker.syncOnce();

      // Test passes if no error is thrown and writeJsonFile is called
      expect(writeJsonFile).toHaveBeenCalled();
    });

    it('should handle file write errors', async () => {
      const { eventLogRepository } = await import('../../src/repositories/eventlog.repo');
      const { readJsonFile, writeJsonFile } = await import('../../src/utils/fsSafe');
      
      vi.mocked(eventLogRepository.getAll).mockResolvedValue(mockEvents);
      vi.mocked(readJsonFile).mockResolvedValue({});
      vi.mocked(writeJsonFile).mockRejectedValue(new Error('File write error'));

      await expect(syncWorker.syncOnce()).rejects.toThrow('File write error');
    });
  });

  describe('periodic sync', () => {
    it('should run periodic sync with custom interval', async () => {
      const { eventLogRepository } = await import('../../src/repositories/eventlog.repo');
      const { readJsonFile, writeJsonFile } = await import('../../src/utils/fsSafe');
      
      vi.mocked(eventLogRepository.getAll).mockResolvedValue(mockEvents);
      vi.mocked(readJsonFile).mockResolvedValue({});
      vi.mocked(writeJsonFile).mockResolvedValue();

      syncWorker.startSync(100); // 100ms interval for testing

      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(writeJsonFile).toHaveBeenCalled();
      syncWorker.stopSync();
    });
  });
});
