import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventLogRepository, Event, DeadLetterEvent } from '../../src/repositories/eventlog.repo';
import { readJsonFile, writeJsonFile } from '../../src/utils/fsSafe';

// Mock fsSafe utilities
vi.mock('../../src/utils/fsSafe', () => ({
  readJsonFile: vi.fn(),
  writeJsonFile: vi.fn(),
  ensureDir: vi.fn(),
}));

const mockReadJsonFile = vi.mocked(readJsonFile);
const mockWriteJsonFile = vi.mocked(writeJsonFile);

describe('EventLogRepository - Dead Letter Queue', () => {
  let eventLogRepo: EventLogRepository;

  beforeEach(() => {
    eventLogRepo = new EventLogRepository();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('recordFailure', () => {
    it('should record failure for an existing event', async () => {
      const event: Event = {
        id: 'event-1',
        type: 'adjustStock',
        payload: { sku: 'SKU123', delta: 10 },
        ts: Date.now(),
        sequence: 1,
      };

      mockReadJsonFile.mockResolvedValue({
        events: [event],
        lastId: 'event-1',
        lastSequence: 1,
      });

      await eventLogRepo.recordFailure('event-1', 'Test failure reason');

      expect(mockWriteJsonFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          events: [expect.objectContaining({
            id: 'event-1',
            retryCount: 1,
            lastFailureTs: expect.any(Number),
            failureReason: 'Test failure reason',
          })],
        })
      );
    });

    it('should increment retry count for multiple failures', async () => {
      const event: Event = {
        id: 'event-1',
        type: 'adjustStock',
        payload: { sku: 'SKU123', delta: 10 },
        ts: Date.now(),
        sequence: 1,
        retryCount: 2,
        lastFailureTs: Date.now() - 1000,
        failureReason: 'Previous failure',
      };

      mockReadJsonFile.mockResolvedValue({
        events: [event],
        lastId: 'event-1',
        lastSequence: 1,
      });

      await eventLogRepo.recordFailure('event-1', 'Another failure');

      expect(mockWriteJsonFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          events: [expect.objectContaining({
            id: 'event-1',
            retryCount: 3,
            failureReason: 'Another failure',
          })],
        })
      );
    });

    it('should handle non-existent event gracefully', async () => {
      mockReadJsonFile.mockResolvedValue({
        events: [],
        lastId: undefined,
        lastSequence: undefined,
      });

      await eventLogRepo.recordFailure('non-existent', 'Test failure');

      expect(mockWriteJsonFile).not.toHaveBeenCalled();
    });
  });

  describe('getFailedEvents', () => {
    it('should return events that have failed but not exceeded max retries', async () => {
      const events: Event[] = [
        {
          id: 'event-1',
          type: 'adjustStock',
          payload: { sku: 'SKU123', delta: 10 },
          ts: Date.now(),
          sequence: 1,
          retryCount: 1,
        },
        {
          id: 'event-2',
          type: 'reserveStock',
          payload: { sku: 'SKU456', qty: 5 },
          ts: Date.now(),
          sequence: 2,
          retryCount: 2,
        },
        {
          id: 'event-3',
          type: 'adjustStock',
          payload: { sku: 'SKU789', delta: -5 },
          ts: Date.now(),
          sequence: 3,
          retryCount: 3, // Should be excluded (max retries reached)
        },
        {
          id: 'event-4',
          type: 'adjustStock',
          payload: { sku: 'SKU999', delta: 10 },
          ts: Date.now(),
          sequence: 4,
          // No retry count - should be excluded
        },
      ];

      mockReadJsonFile.mockResolvedValue({
        events,
        lastId: 'event-4',
        lastSequence: 4,
      });

      const failedEvents = await eventLogRepo.getFailedEvents(3);

      expect(failedEvents).toHaveLength(2);
      expect(failedEvents.map(e => e.id)).toEqual(['event-1', 'event-2']);
    });

    it('should respect custom max retries parameter', async () => {
      const events: Event[] = [
        {
          id: 'event-1',
          type: 'adjustStock',
          payload: { sku: 'SKU123', delta: 10 },
          ts: Date.now(),
          sequence: 1,
          retryCount: 2,
        },
      ];

      mockReadJsonFile.mockResolvedValue({
        events,
        lastId: 'event-1',
        lastSequence: 1,
      });

      const failedEvents = await eventLogRepo.getFailedEvents(2);

      expect(failedEvents).toHaveLength(0); // retryCount >= maxRetries
    });
  });

  describe('moveToDeadLetter', () => {
    it('should move event to dead letter queue and remove from main log', async () => {
      const event: Event = {
        id: 'event-1',
        type: 'adjustStock',
        payload: { sku: 'SKU123', delta: 10 },
        ts: Date.now(),
        sequence: 1,
        retryCount: 3,
        lastFailureTs: Date.now(),
        failureReason: 'Max retries exceeded',
      };

      mockReadJsonFile
        .mockResolvedValueOnce({
          events: [event],
          lastId: 'event-1',
          lastSequence: 1,
        })
        .mockResolvedValueOnce([]); // Empty dead letter queue

      await eventLogRepo.moveToDeadLetter('event-1', 'Max retries exceeded');

      // Should remove from main log
      expect(mockWriteJsonFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          events: [],
        })
      );

      // Should append to dead letter queue
      expect(mockWriteJsonFile).toHaveBeenCalledWith(
        expect.stringContaining('dead-letter.json'),
        expect.arrayContaining([
          expect.objectContaining({
            originalEvent: event,
            dlqTs: expect.any(Number),
            finalFailureReason: 'Max retries exceeded',
            totalRetries: 3,
          }),
        ])
      );
    });

    it('should handle non-existent event', async () => {
      mockReadJsonFile.mockResolvedValue({
        events: [],
        lastId: undefined,
        lastSequence: undefined,
      });

      await expect(
        eventLogRepo.moveToDeadLetter('non-existent', 'Test reason')
      ).rejects.toThrow('Failed to move event non-existent to dead letter queue');
    });
  });

  describe('getDeadLetterEvents', () => {
    it('should return dead letter events', async () => {
      const deadLetterEvents: DeadLetterEvent[] = [
        {
          originalEvent: {
            id: 'event-1',
            type: 'adjustStock',
            payload: { sku: 'SKU123', delta: 10 },
            ts: Date.now(),
            sequence: 1,
          },
          dlqTs: Date.now(),
          finalFailureReason: 'Max retries exceeded',
          totalRetries: 3,
        },
      ];

      mockReadJsonFile.mockResolvedValue(deadLetterEvents);

      const result = await eventLogRepo.getDeadLetterEvents();

      expect(result).toEqual(deadLetterEvents);
    });

    it('should return empty array if no dead letter events', async () => {
      mockReadJsonFile.mockResolvedValue([]);

      const result = await eventLogRepo.getDeadLetterEvents();

      expect(result).toEqual([]);
    });
  });

  describe('clearDeadLetterQueue', () => {
    it('should clear dead letter queue', async () => {
      await eventLogRepo.clearDeadLetterQueue();

      expect(mockWriteJsonFile).toHaveBeenCalledWith(
        expect.stringContaining('dead-letter.json'),
        []
      );
    });
  });
});
