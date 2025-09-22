import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { snapshotter } from '../../src/ops/snapshotter';
import { eventLogRepository } from '../../src/repositories/eventlog.repo';
import { readJsonFile, writeJsonAtomic, ensureDir, deleteFile } from '../../src/utils/fsSafe';
import { config } from '../../src/core/config';
import { freezeNow, restoreNow } from '../../src/testing/time';

// Mock dependencies
vi.mock('../../src/repositories/eventlog.repo');
vi.mock('../../src/utils/fsSafe');
vi.mock('../../src/core/config', () => ({
  config: {
    SNAPSHOT_EVERY_N_EVENTS: 3,
  },
}));
vi.mock('../../src/workers/sync.worker.events', () => ({
  EventProcessor: vi.fn().mockImplementation(() => ({
    applyEventToCentral: vi.fn().mockImplementation((inventory, event) => {
      // Simple mock implementation
      if (event.type === 'stock_adjusted') {
        const { sku, storeId, delta } = event.payload as any;
        if (!inventory[sku]) {
          inventory[sku] = {};
        }
        if (!inventory[sku][storeId]) {
          inventory[sku][storeId] = { qty: 0, version: 0 };
        }
        inventory[sku][storeId].qty += delta;
        inventory[sku][storeId].version += 1;
      }
    }),
  })),
}));

describe('Snapshotter', () => {
  const dataDir = process.env.TEST_DATA_DIR || 'data';
  const snapshotsDir = join(dataDir, 'snapshots');
  const eventLogPath = join(dataDir, 'event-log.json');

  beforeEach(async () => {
    // Freeze time for deterministic tests
    freezeNow('2025-01-01T00:00:00Z');
    
    // Clean up test data
    try {
      await fs.rmdir(snapshotsDir, { recursive: true });
    } catch {}
    try {
      await fs.unlink(eventLogPath);
    } catch {}
  });

  afterEach(async () => {
    // Restore real timers
    restoreNow();
    
    // Clean up test data
    try {
      await fs.rmdir(snapshotsDir, { recursive: true });
    } catch {}
    try {
      await fs.unlink(eventLogPath);
    } catch {}
  });

  describe('maybeSnapshot', () => {
    it('should create snapshot when event count reaches threshold', async () => {
      const events = [
        { id: 'event-1', type: 'stock_adjusted', payload: {}, ts: Date.now(), sequence: 1 },
        { id: 'event-2', type: 'stock_adjusted', payload: {}, ts: Date.now(), sequence: 2 },
        { id: 'event-3', type: 'stock_adjusted', payload: {}, ts: Date.now(), sequence: 3 },
      ];

      const centralInventory = {
        'SKU123': {
          'STORE001': { qty: 150, version: 3 },
        },
      };

      // Mock file operations
      vi.mocked(ensureDir).mockResolvedValue(undefined);
      vi.mocked(writeJsonAtomic).mockResolvedValue(undefined);

      const snapshot = await snapshotter.maybeSnapshot(events, centralInventory);

      expect(snapshot).toBeTruthy();
      expect(snapshot?.sequence).toBe(3);
      expect(snapshot?.eventCount).toBe(3);
      expect(snapshot?.centralInventory).toEqual(centralInventory);

      // Verify snapshot was saved
      expect(writeJsonAtomic).toHaveBeenCalledWith(
        expect.stringContaining('snapshots/central-3.json'),
        expect.objectContaining({
          sequence: 3,
          centralInventory,
          eventCount: 3,
        })
      );
    });

    it('should not create snapshot when event count is below threshold', async () => {
      const events = [
        { id: 'event-1', type: 'stock_adjusted', payload: {}, ts: Date.now(), sequence: 1 },
        { id: 'event-2', type: 'stock_adjusted', payload: {}, ts: Date.now(), sequence: 2 },
      ];

      const centralInventory = {
        'SKU123': {
          'STORE001': { qty: 100, version: 2 },
        },
      };

      const snapshot = await snapshotter.maybeSnapshot(events, centralInventory);

      expect(snapshot).toBeNull();
    });

    it('should not create snapshot when no events', async () => {
      const events: any[] = [];
      const centralInventory = {};

      const snapshot = await snapshotter.maybeSnapshot(events, centralInventory);

      expect(snapshot).toBeNull();
    });
  });

  describe('compactEventLog', () => {
    it('should remove events up to snapshot sequence', async () => {
      const allEvents = [
        { id: 'event-1', type: 'stock_adjusted', payload: {}, ts: Date.now(), sequence: 1 },
        { id: 'event-2', type: 'stock_adjusted', payload: {}, ts: Date.now(), sequence: 2 },
        { id: 'event-3', type: 'stock_adjusted', payload: {}, ts: Date.now(), sequence: 3 },
        { id: 'event-4', type: 'stock_adjusted', payload: {}, ts: Date.now(), sequence: 4 },
        { id: 'event-5', type: 'stock_adjusted', payload: {}, ts: Date.now(), sequence: 5 },
      ];

      // Mock event log repository
      const mockEventLogRepo = {
        getAll: vi.fn().mockResolvedValue(allEvents),
      };
      vi.mocked(eventLogRepository).getAll = mockEventLogRepo.getAll;

      // Mock file operations
      vi.mocked(writeJsonAtomic).mockResolvedValue(undefined);

      await snapshotter.compactEventLog(3);

      // Verify compacted event log was saved
      expect(writeJsonAtomic).toHaveBeenCalledWith(
        expect.stringContaining('event-log.json'),
        expect.objectContaining({
          events: [
            { id: 'event-4', type: 'stock_adjusted', payload: {}, ts: expect.any(Number), sequence: 4 },
            { id: 'event-5', type: 'stock_adjusted', payload: {}, ts: expect.any(Number), sequence: 5 },
          ],
          lastId: 'event-5',
          lastSequence: 5,
        })
      );
    });

    it('should handle empty event log', async () => {
      // Clear all mocks first to ensure clean state
      vi.clearAllMocks();
      
      // Mock event log repository
      const mockEventLogRepo = {
        getAll: vi.fn().mockResolvedValue([]),
      };
      vi.mocked(eventLogRepository).getAll = mockEventLogRepo.getAll;

      // Mock file operations
      vi.mocked(writeJsonAtomic).mockResolvedValue(undefined);

      await snapshotter.compactEventLog(3);

      // Verify compacted event log was saved with empty events
      expect(writeJsonAtomic).toHaveBeenCalledWith(
        expect.stringContaining('event-log.json'),
        expect.objectContaining({
          events: [],
          lastSequence: 3,
        })
      );
    });
  });

  describe('loadSnapshot', () => {
    it('should load snapshot by sequence', async () => {
      const snapshotData = {
        sequence: 3,
        timestamp: Date.now(),
        centralInventory: {
          'SKU123': {
            'STORE001': { qty: 150, version: 3 },
          },
        },
        eventCount: 3,
      };

      // Mock file operations
      vi.mocked(readJsonFile).mockResolvedValue(snapshotData);

      const snapshot = await snapshotter.loadSnapshot(3);

      expect(snapshot).toEqual(snapshotData);
      expect(readJsonFile).toHaveBeenCalledWith(expect.stringContaining('snapshots/central-3.json'));
    });

    it('should return null if snapshot not found', async () => {
      // Mock file operations to throw error
      vi.mocked(readJsonFile).mockRejectedValue(new Error('File not found'));

      const snapshot = await snapshotter.loadSnapshot(999);

      expect(snapshot).toBeNull();
    });
  });

  describe('replayFromSnapshot', () => {
    it('should replay from snapshot and apply tail events', async () => {
      const snapshot = {
        sequence: 2,
        timestamp: Date.now() - 1000,
        centralInventory: {
          'SKU123': {
            'STORE001': { qty: 120, version: 2 },
          },
        },
        eventCount: 2,
      };

      const tailEvents = [
        {
          id: 'event-3',
          type: 'stock_adjusted',
          payload: { sku: 'SKU123', storeId: 'STORE001', delta: 30, previousQty: 120, newQty: 150, previousVersion: 2, newVersion: 3 },
          ts: Date.now(),
          sequence: 3,
        },
      ];

      // Mock event log repository
      const mockEventLogRepo = {
        getAll: vi.fn().mockResolvedValue(tailEvents),
      };
      vi.mocked(eventLogRepository).getAll = mockEventLogRepo.getAll;

      const result = await snapshotter.replayFromSnapshot(snapshot);

      // The result should have the snapshot state plus the tail event applied
      expect(result).toEqual({
        'SKU123': {
          'STORE001': { qty: 150, version: 3 },
        },
      });
    });

    it('should handle snapshot with no tail events', async () => {
      const snapshot = {
        sequence: 3,
        timestamp: Date.now(),
        centralInventory: {
          'SKU123': {
            'STORE001': { qty: 150, version: 3 },
          },
        },
        eventCount: 3,
      };

      // Mock event log repository
      const mockEventLogRepo = {
        getAll: vi.fn().mockResolvedValue([]),
      };
      vi.mocked(eventLogRepository).getAll = mockEventLogRepo.getAll;

      const result = await snapshotter.replayFromSnapshot(snapshot);

      // The result should be the same as the snapshot
      expect(result).toEqual(snapshot.centralInventory);
    });
  });

  describe('cleanupOldSnapshots', () => {
    it('should keep only the latest N snapshots', async () => {
      // Mock listSnapshotFiles to return multiple snapshots
      const mockListSnapshotFiles = vi.fn().mockResolvedValue([
        { sequence: 1, path: join(snapshotsDir, 'central-1.json') },
        { sequence: 2, path: join(snapshotsDir, 'central-2.json') },
        { sequence: 3, path: join(snapshotsDir, 'central-3.json') },
        { sequence: 4, path: join(snapshotsDir, 'central-4.json') },
        { sequence: 5, path: join(snapshotsDir, 'central-5.json') },
      ]);

      // Mock the private method
      vi.spyOn(snapshotter as any, 'listSnapshotFiles').mockImplementation(mockListSnapshotFiles);

      // Mock file operations
      vi.mocked(deleteFile).mockResolvedValue(undefined);

      await snapshotter.cleanupOldSnapshots(3);

      // Should delete the oldest 2 snapshots (sequences 1 and 2)
      expect(deleteFile).toHaveBeenCalledWith(join(snapshotsDir, 'central-1.json'));
      expect(deleteFile).toHaveBeenCalledWith(join(snapshotsDir, 'central-2.json'));
      expect(deleteFile).not.toHaveBeenCalledWith(join(snapshotsDir, 'central-3.json'));
      expect(deleteFile).not.toHaveBeenCalledWith(join(snapshotsDir, 'central-4.json'));
      expect(deleteFile).not.toHaveBeenCalledWith(join(snapshotsDir, 'central-5.json'));
    });

    it('should not delete anything if count is below threshold', async () => {
      // Clear all mocks first
      vi.clearAllMocks();
      
      // Mock listSnapshotFiles to return few snapshots
      const mockListSnapshotFiles = vi.fn().mockResolvedValue([
        { sequence: 1, path: join(snapshotsDir, 'central-1.json') },
        { sequence: 2, path: join(snapshotsDir, 'central-2.json') },
      ]);

      // Mock the private method
      vi.spyOn(snapshotter as any, 'listSnapshotFiles').mockImplementation(mockListSnapshotFiles);

      // Mock file operations
      vi.mocked(deleteFile).mockResolvedValue(undefined);

      await snapshotter.cleanupOldSnapshots(3);

      // Should not delete anything
      expect(deleteFile).not.toHaveBeenCalled();
    });
  });
});
