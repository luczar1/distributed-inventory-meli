import { describe, it, expect, vi } from 'vitest';
import { mapLimit } from '../../src/utils/mapLimit';

describe('mapLimit - Concurrency Behavior', () => {
  it('should process items in batches', async () => {
    const items = [1, 2, 3, 4, 5, 6];
    const executionTimes: number[] = [];
    const fn = vi.fn().mockImplementation(async (item: number) => {
      const startTime = Date.now();
      executionTimes.push(startTime);
      await new Promise(resolve => setTimeout(resolve, 50));
      return item * 2;
    });

    await mapLimit(items, 3, fn);

    // Should have 6 executions
    expect(executionTimes).toHaveLength(6);
    
    // First 3 should start at roughly the same time
    const firstBatch = executionTimes.slice(0, 3);
    const secondBatch = executionTimes.slice(3, 6);
    
    // First batch should start before second batch
    const firstBatchMax = Math.max(...firstBatch);
    const secondBatchMin = Math.min(...secondBatch);
    expect(secondBatchMin).toBeGreaterThan(firstBatchMax);
  });

  it('should handle limit of 1 (sequential processing)', async () => {
    const items = [1, 2, 3];
    const executionOrder: number[] = [];
    const fn = vi.fn().mockImplementation(async (item: number) => {
      executionOrder.push(item);
      await new Promise(resolve => setTimeout(resolve, 10));
      return item * 2;
    });

    await mapLimit(items, 1, fn);

    expect(executionOrder).toEqual([1, 2, 3]);
  });
});
