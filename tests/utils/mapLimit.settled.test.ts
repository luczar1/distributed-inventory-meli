import { describe, it, expect, vi } from 'vitest';
import { mapLimitSettled } from '../../src/utils/mapLimit';

describe('mapLimitSettled', () => {
  it('should process all items with limit', async () => {
    const items = [1, 2, 3, 4, 5];
    const fn = vi.fn().mockImplementation(async (item: number) => item * 2);

    const results = await mapLimitSettled(items, 2, fn);

    expect(results).toHaveLength(5);
    results.forEach((result, index) => {
      expect(result.status).toBe('fulfilled');
      if (result.status === 'fulfilled') {
        expect(result.value).toBe((index + 1) * 2);
      }
    });
  });

  it('should handle function errors gracefully', async () => {
    const items = [1, 2, 3];
    const fn = vi.fn().mockImplementation(async (item: number) => {
      if (item === 2) throw new Error('Item 2 failed');
      return item * 2;
    });

    const results = await mapLimitSettled(items, 2, fn);

    expect(results).toHaveLength(3);
    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('rejected');
    expect(results[2].status).toBe('fulfilled');

    if (results[0].status === 'fulfilled') {
      expect(results[0].value).toBe(2);
    }
    if (results[1].status === 'rejected') {
      expect(results[1].reason.message).toContain('Error processing item at index 1');
    }
    if (results[2].status === 'fulfilled') {
      expect(results[2].value).toBe(6);
    }
  });

  it('should handle empty array', async () => {
    const results = await mapLimitSettled([], 2, vi.fn());
    expect(results).toEqual([]);
  });

  it('should handle single item', async () => {
    const items = [1];
    const fn = vi.fn().mockResolvedValue(2);

    const results = await mapLimitSettled(items, 2, fn);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('fulfilled');
    if (results[0].status === 'fulfilled') {
      expect(results[0].value).toBe(2);
    }
  });

  it('should throw error for invalid limit', async () => {
    const items = [1, 2, 3];
    const fn = vi.fn();

    await expect(mapLimitSettled(items, 0, fn)).rejects.toThrow('Limit must be greater than 0');
    await expect(mapLimitSettled(items, -1, fn)).rejects.toThrow('Limit must be greater than 0');
  });

  it('should handle valid items correctly', async () => {
    const items = [1, 2, 3];
    const fn = vi.fn().mockImplementation(async (item: number) => {
      return item * 2;
    });

    const results = await mapLimitSettled(items, 2, fn);

    expect(results).toHaveLength(3);
    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('fulfilled');
    expect(results[2].status).toBe('fulfilled');

    if (results[0].status === 'fulfilled') {
      expect(results[0].value).toBe(2);
    }
    if (results[1].status === 'fulfilled') {
      expect(results[1].value).toBe(4);
    }
    if (results[2].status === 'fulfilled') {
      expect(results[2].value).toBe(6);
    }
  });

  it('should respect concurrency limit', async () => {
    const items = [1, 2, 3, 4, 5];
    const executionOrder: number[] = [];
    const fn = vi.fn().mockImplementation(async (item: number) => {
      executionOrder.push(item);
      await new Promise(resolve => setTimeout(resolve, 10));
      return item * 2;
    });

    await mapLimitSettled(items, 2, fn);

    // First two should start immediately
    expect(executionOrder.slice(0, 2)).toEqual([1, 2]);
  });
});
