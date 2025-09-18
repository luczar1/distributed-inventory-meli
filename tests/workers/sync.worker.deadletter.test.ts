import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SyncWorker } from '../../src/workers/sync.worker.core';
import { eventLogRepository } from '../../src/repositories/eventlog.repo';
import { EventProcessor } from '../../src/workers/sync.worker.events';
import { snapshotter } from '../../src/ops/snapshotter';
import { readJsonFile, writeJsonFile, ensureDir } from '../../src/utils/fsSafe';

// Mock dependencies
vi.mock('../../src/repositories/eventlog.repo');
vi.mock('../../src/workers/sync.worker.events', () => ({
  EventProcessor: vi.fn().mockImplementation(() => ({
    processEvent: vi.fn(),
  })),
}));
vi.mock('../../src/ops/snapshotter');
vi.mock('../../src/utils/fsSafe', () => ({
  readJsonFile: vi.fn(),
  writeJsonFile: vi.fn(),
  ensureDir: vi.fn(),
}));
vi.mock('../../src/utils/circuitBreaker', () => ({
  syncWorkerBreaker: {
    execute: vi.fn((fn) => fn()),
    isOpen: vi.fn(() => false),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
  },
}));
vi.mock('../../src/utils/bulkhead', () => ({
  syncBulkhead: {
    run: vi.fn((fn) => fn()),
  },
}));

const mockEventLogRepository = vi.mocked(eventLogRepository);
const mockEventProcessor = vi.mocked(EventProcessor);
const mockSnapshotter = vi.mocked(snapshotter);

describe('SyncWorker - Dead Letter Queue', () => {
  let syncWorker: SyncWorker;
  let mockEventProcessorInstance: any;

  beforeEach(() => {
    // Create a fresh mock instance for each test
    mockEventProcessorInstance = {
      processEvent: vi.fn(),
    };
    mockEventProcessor.mockImplementation(() => mockEventProcessorInstance);
    
    syncWorker = new SyncWorker();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('applyEventsToCentral with retry logic', () => {
    it('should process events successfully and continue on failures', async () => {
      const events = [
        {
          id: 'event-1',
          type: 'adjustStock',
          payload: { sku: 'SKU123', delta: 10 },
          ts: Date.now(),
          sequence: 1,
        },
        {
          id: 'event-2',
          type: 'adjustStock',
          payload: { sku: 'SKU456', delta: -5 },
          ts: Date.now(),
          sequence: 2,
        },
        {
          id: 'event-3',
          type: 'reserveStock',
          payload: { sku: 'SKU789', qty: 3 },
          ts: Date.now(),
          sequence: 3,
        },
      ];

      mockEventLogRepository.getAll.mockResolvedValue(events);
      
      // First event succeeds, second fails, third succeeds
      mockEventProcessorInstance.processEvent
        .mockResolvedValueOnce(undefined) // event-1 succeeds
        .mockRejectedValueOnce(new Error('Processing failed')) // event-2 fails
        .mockResolvedValueOnce(undefined); // event-3 succeeds

      mockEventLogRepository.recordFailure.mockResolvedValue(undefined);
      mockEventLogRepository.moveToDeadLetter.mockResolvedValue(undefined);

      // Mock central inventory operations
      const mockCentralInventory = { 'SKU123': { qty: 100 } };
      vi.mocked(readJsonFile).mockResolvedValue(mockCentralInventory);
      vi.mocked(writeJsonFile).mockResolvedValue(undefined);
      vi.mocked(ensureDir).mockResolvedValue(undefined);

      mockSnapshotter.maybeSnapshot.mockResolvedValue(null);
      mockSnapshotter.compactEventLog.mockResolvedValue(undefined);
      mockSnapshotter.cleanupOldSnapshots.mockResolvedValue(undefined);

      await syncWorker.syncOnce();

      // Should have processed all events
      expect(mockEventProcessorInstance.processEvent).toHaveBeenCalledTimes(3);
      
      // Should have recorded failure for event-2
      expect(mockEventLogRepository.recordFailure).toHaveBeenCalledWith('event-2', 'Processing failed');
      
      // Should not have moved any events to dead letter (retry count < 3)
      expect(mockEventLogRepository.moveToDeadLetter).not.toHaveBeenCalled();
    });

    it('should move events to dead letter queue after max retries', async () => {
      const events = [
        {
          id: 'event-1',
          type: 'adjustStock',
          payload: { sku: 'SKU123', delta: 10 },
          ts: Date.now(),
          sequence: 1,
          retryCount: 3, // Already at max retries
        },
        {
          id: 'event-2',
          type: 'adjustStock',
          payload: { sku: 'SKU456', delta: -5 },
          ts: Date.now(),
          sequence: 2,
        },
      ];

      mockEventLogRepository.getAll.mockResolvedValue(events);
      
      // Both events fail
      mockEventProcessorInstance.processEvent
        .mockRejectedValueOnce(new Error('Processing failed'))
        .mockRejectedValueOnce(new Error('Another failure'));

      mockEventLogRepository.recordFailure.mockResolvedValue(undefined);
      mockEventLogRepository.moveToDeadLetter.mockResolvedValue(undefined);

      // Mock central inventory operations
      const mockCentralInventory = { 'SKU123': { qty: 100 } };
      vi.mocked(readJsonFile).mockResolvedValue(mockCentralInventory);
      vi.mocked(writeJsonFile).mockResolvedValue(undefined);
      vi.mocked(ensureDir).mockResolvedValue(undefined);

      mockSnapshotter.maybeSnapshot.mockResolvedValue(null);

      await syncWorker.syncOnce();

      // Should have processed both events
      expect(mockEventProcessorInstance.processEvent).toHaveBeenCalledTimes(2);
      
      // Should have recorded failures for both events
      expect(mockEventLogRepository.recordFailure).toHaveBeenCalledWith('event-1', 'Processing failed');
      expect(mockEventLogRepository.recordFailure).toHaveBeenCalledWith('event-2', 'Another failure');
      
      // Should have moved event-1 to dead letter (retry count >= 3)
      expect(mockEventLogRepository.moveToDeadLetter).toHaveBeenCalledWith('event-1', 'Max retries (3) exceeded');
      
      // Should not have moved event-2 (retry count < 3)
      expect(mockEventLogRepository.moveToDeadLetter).toHaveBeenCalledTimes(1);
    });

    it('should not save central inventory if no events were processed successfully', async () => {
      const events = [
        {
          id: 'event-1',
          type: 'adjustStock',
          payload: { sku: 'SKU123', delta: 10 },
          ts: Date.now(),
          sequence: 1,
        },
      ];

      mockEventLogRepository.getAll.mockResolvedValue(events);
      
      // All events fail
      mockEventProcessorInstance.processEvent.mockRejectedValue(new Error('Processing failed'));

      mockEventLogRepository.recordFailure.mockResolvedValue(undefined);
      mockEventLogRepository.moveToDeadLetter.mockResolvedValue(undefined);

      // Mock central inventory operations
      const mockCentralInventory = { 'SKU123': { qty: 100 } };
      vi.mocked(readJsonFile).mockResolvedValue(mockCentralInventory);
      vi.mocked(writeJsonFile).mockResolvedValue(undefined);
      vi.mocked(ensureDir).mockResolvedValue(undefined);

      await syncWorker.syncOnce();

      // Should have processed the event
      expect(mockEventProcessorInstance.processEvent).toHaveBeenCalledTimes(1);
      
      // Should have recorded failure
      expect(mockEventLogRepository.recordFailure).toHaveBeenCalledWith('event-1', 'Processing failed');
      
      // Should not have saved central inventory (no successful events)
      expect(writeJsonFile).not.toHaveBeenCalled();
    });

    it('should handle mixed success and failure scenarios', async () => {
      const events = [
        {
          id: 'event-1',
          type: 'adjustStock',
          payload: { sku: 'SKU123', delta: 10 },
          ts: Date.now(),
          sequence: 1,
        },
        {
          id: 'event-2',
          type: 'adjustStock',
          payload: { sku: 'SKU456', delta: -5 },
          ts: Date.now(),
          sequence: 2,
          retryCount: 3, // At max retries
        },
        {
          id: 'event-3',
          type: 'reserveStock',
          payload: { sku: 'SKU789', qty: 3 },
          ts: Date.now(),
          sequence: 3,
        },
      ];

      mockEventLogRepository.getAll.mockResolvedValue(events);
      
      // First succeeds, second fails, third succeeds
      mockEventProcessorInstance.processEvent
        .mockResolvedValueOnce(undefined) // event-1 succeeds
        .mockRejectedValueOnce(new Error('Processing failed')) // event-2 fails
        .mockResolvedValueOnce(undefined); // event-3 succeeds

      mockEventLogRepository.recordFailure.mockResolvedValue(undefined);
      mockEventLogRepository.moveToDeadLetter.mockResolvedValue(undefined);

      // Mock central inventory operations
      const mockCentralInventory = { 'SKU123': { qty: 100 } };
      vi.mocked(readJsonFile).mockResolvedValue(mockCentralInventory);
      vi.mocked(writeJsonFile).mockResolvedValue(undefined);
      vi.mocked(ensureDir).mockResolvedValue(undefined);

      mockSnapshotter.maybeSnapshot.mockResolvedValue(null);

      await syncWorker.syncOnce();

      // Should have processed all events
      expect(mockEventProcessorInstance.processEvent).toHaveBeenCalledTimes(3);
      
      // Should have recorded failure for event-2
      expect(mockEventLogRepository.recordFailure).toHaveBeenCalledWith('event-2', 'Processing failed');
      
      // Should have moved event-2 to dead letter (retry count >= 3)
      expect(mockEventLogRepository.moveToDeadLetter).toHaveBeenCalledWith('event-2', 'Max retries (3) exceeded');
      
      // Should have saved central inventory (some events succeeded)
      expect(writeJsonFile).toHaveBeenCalled();
    });
  });
});
