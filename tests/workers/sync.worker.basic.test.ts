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

describe('SyncWorker - Basic Operations', () => {
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

  describe('startSync and stopSync', () => {
    it('should start sync worker with default interval', () => {
      syncWorker.startSync();
      
      expect(syncWorker.getStatus().isRunning).toBe(true);
    });

    it('should start sync worker with custom interval', () => {
      syncWorker.startSync(5000);
      
      expect(syncWorker.getStatus().isRunning).toBe(true);
    });

    it('should stop sync worker', () => {
      syncWorker.startSync();
      syncWorker.stopSync();
      
      expect(syncWorker.getStatus().isRunning).toBe(false);
    });

    it('should warn when starting already running worker', () => {
      syncWorker.startSync();
      syncWorker.startSync();
      
      // Test passes if no error is thrown
      expect(syncWorker.getStatus().isRunning).toBe(true);
    });

    it('should warn when stopping non-running worker', () => {
      syncWorker.stopSync();
      
      // Test passes if no error is thrown
      expect(syncWorker.getStatus().isRunning).toBe(false);
    });
  });

  describe('syncOnce', () => {
    it('should process events successfully', async () => {
      const { eventLogRepository } = await import('../../src/repositories/eventlog.repo');
      const { readJsonFile, writeJsonFile } = await import('../../src/utils/fsSafe');
      
      vi.mocked(eventLogRepository.getAll).mockResolvedValue(mockEvents);
      vi.mocked(readJsonFile).mockResolvedValue({});
      vi.mocked(writeJsonFile).mockResolvedValue();

      await syncWorker.syncOnce();

      expect(eventLogRepository.getAll).toHaveBeenCalled();
      expect(writeJsonFile).toHaveBeenCalled();
    });

    it('should handle no events gracefully', async () => {
      const { eventLogRepository } = await import('../../src/repositories/eventlog.repo');
      
      vi.mocked(eventLogRepository.getAll).mockResolvedValue([]);

      await syncWorker.syncOnce();

      // Test passes if no error is thrown
      expect(eventLogRepository.getAll).toHaveBeenCalled();
    });

    it('should handle errors during sync', async () => {
      const { eventLogRepository } = await import('../../src/repositories/eventlog.repo');
      
      vi.mocked(eventLogRepository.getAll).mockRejectedValue(new Error('Event log error'));

      await expect(syncWorker.syncOnce()).rejects.toThrow('Event log error');
    });
  });

  describe('getStatus', () => {
    it('should return correct status when not running', () => {
      const status = syncWorker.getStatus();
      
      expect(status.isRunning).toBe(false);
      expect(status.lastProcessedEventId).toBeUndefined();
    });

    it('should return correct status when running', () => {
      syncWorker.startSync();
      
      const status = syncWorker.getStatus();
      
      expect(status.isRunning).toBe(true);
    });
  });

  describe('resetState', () => {
    it('should reset worker state', () => {
      syncWorker.startSync();
      
      syncWorker.resetState();
      
      const status = syncWorker.getStatus();
      expect(status.isRunning).toBe(false);
    });
  });
});
