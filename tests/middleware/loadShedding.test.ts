import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LoadShedder } from '../../src/middleware/loadShedding';
import { apiBulkhead, syncBulkhead } from '../../src/utils/bulkhead';

// Mock the bulkheads
vi.mock('../../src/utils/bulkhead', () => ({
  apiBulkhead: {
    getStats: vi.fn(),
  },
  syncBulkhead: {
    getStats: vi.fn(),
  },
}));

describe('LoadShedder', () => {
  let loadShedder: LoadShedder;
  let mockApiBulkhead: any;
  let mockSyncBulkhead: any;

  beforeEach(() => {
    loadShedder = new LoadShedder('test');
    mockApiBulkhead = vi.mocked(apiBulkhead);
    mockSyncBulkhead = vi.mocked(syncBulkhead);
  });

  describe('Queue Depth Checking', () => {
    it('should not shed when queue depth is below threshold', () => {
      mockApiBulkhead.getStats.mockReturnValue({ queued: 5 });
      mockSyncBulkhead.getStats.mockReturnValue({ queued: 3 });
      
      expect(loadShedder.shouldShed()).toBe(false);
    });

    it('should shed when queue depth exceeds threshold', () => {
      mockApiBulkhead.getStats.mockReturnValue({ queued: 1001 }); // Above default threshold (1000)
      mockSyncBulkhead.getStats.mockReturnValue({ queued: 0 });
      
      expect(loadShedder.shouldShed()).toBe(true);
    });

    it('should calculate total queue depth from both bulkheads', () => {
      mockApiBulkhead.getStats.mockReturnValue({ queued: 500 });
      mockSyncBulkhead.getStats.mockReturnValue({ queued: 600 });
      
      expect(loadShedder.getQueueDepth()).toBe(1100);
    });
  });

  describe('Statistics', () => {
    it('should track shed requests', () => {
      mockApiBulkhead.getStats.mockReturnValue({ queued: 1001 });
      mockSyncBulkhead.getStats.mockReturnValue({ queued: 0 });
      
      loadShedder.shouldShed();
      loadShedder.shouldShed();
      
      const stats = loadShedder.getStats();
      expect(stats.shedRequests).toBe(2);
      expect(stats.totalRequests).toBe(2);
    });

    it('should track total requests', () => {
      mockApiBulkhead.getStats.mockReturnValue({ queued: 5 });
      mockSyncBulkhead.getStats.mockReturnValue({ queued: 3 });
      
      loadShedder.shouldShed();
      loadShedder.shouldShed();
      
      const stats = loadShedder.getStats();
      expect(stats.totalRequests).toBe(2);
      expect(stats.shedRequests).toBe(0);
    });

    it('should reset statistics', () => {
      mockApiBulkhead.getStats.mockReturnValue({ queued: 1001 });
      mockSyncBulkhead.getStats.mockReturnValue({ queued: 0 });
      
      loadShedder.shouldShed();
      loadShedder.reset();
      
      const stats = loadShedder.getStats();
      expect(stats.shedRequests).toBe(0);
      expect(stats.totalRequests).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero queue depth', () => {
      mockApiBulkhead.getStats.mockReturnValue({ queued: 0 });
      mockSyncBulkhead.getStats.mockReturnValue({ queued: 0 });
      
      expect(loadShedder.getQueueDepth()).toBe(0);
      expect(loadShedder.shouldShed()).toBe(false);
    });

    it('should handle negative queue depth gracefully', () => {
      mockApiBulkhead.getStats.mockReturnValue({ queued: -1 });
      mockSyncBulkhead.getStats.mockReturnValue({ queued: 0 });
      
      expect(loadShedder.getQueueDepth()).toBe(-1);
      expect(loadShedder.shouldShed()).toBe(false);
    });
  });
});
