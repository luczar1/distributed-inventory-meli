import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { snapshotter } from '../../src/ops/snapshotter';
import { writeJsonAtomic, ensureDir, readJsonFile } from '../../src/utils/fsSafe';

// Mock all dependencies
vi.mock('../../src/repositories/eventlog.repo');
vi.mock('../../src/utils/fsSafe');
vi.mock('../../src/core/config', () => ({
  config: {
    SNAPSHOT_EVERY_N_EVENTS: 3,
  },
}));
vi.mock('../../src/workers/sync.worker.events');

describe('Snapshotter - Simple', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
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
      const mockWriteJsonAtomic = vi.fn().mockResolvedValue(undefined);
      const mockEnsureDir = vi.fn().mockResolvedValue(undefined);
      
      vi.mocked(writeJsonAtomic).mockImplementation(mockWriteJsonAtomic);
      vi.mocked(ensureDir).mockImplementation(mockEnsureDir);

      const snapshot = await snapshotter.maybeSnapshot(events, centralInventory);

      expect(snapshot).toBeTruthy();
      expect(snapshot?.sequence).toBe(3);
      expect(snapshot?.eventCount).toBe(3);
      expect(snapshot?.centralInventory).toEqual(centralInventory);

      // Verify snapshot was saved
      expect(mockWriteJsonAtomic).toHaveBeenCalledWith(
        expect.stringContaining('central-3.json'),
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
      const mockReadJsonFile = vi.fn().mockResolvedValue(snapshotData);
      vi.mocked(readJsonFile).mockImplementation(mockReadJsonFile);

      const snapshot = await snapshotter.loadSnapshot(3);

      expect(snapshot).toEqual(snapshotData);
      expect(mockReadJsonFile).toHaveBeenCalledWith(expect.stringContaining('central-3.json'));
    });

    it('should return null if snapshot not found', async () => {
      // Mock file operations to throw error
      const mockReadJsonFile = vi.fn().mockRejectedValue(new Error('File not found'));
      vi.mocked(readJsonFile).mockImplementation(mockReadJsonFile);

      const snapshot = await snapshotter.loadSnapshot(999);

      expect(snapshot).toBeNull();
    });
  });
});
