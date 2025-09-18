import { describe, it, expect, vi } from 'vitest';
import { mapLimit } from '../../src/utils/mapLimit';

describe('mapLimit - Basic Functionality', () => {
  it('should process all items with limit', async () => {
    const items = [1, 2, 3, 4, 5];
    const fn = vi.fn().mockImplementation(async (item: number) => item * 2);

    const results = await mapLimit(items, 2, fn);

    expect(results).toEqual([2, 4, 6, 8, 10]);
    expect(fn).toHaveBeenCalledTimes(5);
  });

  it('should respect concurrency limit', async () => {
    const items = [1, 2, 3, 4, 5];
    const executionOrder: number[] = [];
    const fn = vi.fn().mockImplementation(async (item: number) => {
      executionOrder.push(item);
      await new Promise(resolve => setTimeout(resolve, 10));
      return item * 2;
    });

    await mapLimit(items, 2, fn);

    // First two should start immediately
    expect(executionOrder.slice(0, 2)).toEqual([1, 2]);
  });

  it('should handle empty array', async () => {
    const results = await mapLimit([], 2, vi.fn());
    expect(results).toEqual([]);
  });

  it('should handle single item', async () => {
    const items = [1];
    const fn = vi.fn().mockResolvedValue(2);

    const results = await mapLimit(items, 2, fn);

    expect(results).toEqual([2]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should handle limit greater than items length', async () => {
    const items = [1, 2];
    const fn = vi.fn().mockImplementation(async (item: number) => item * 2);

    const results = await mapLimit(items, 5, fn);

    expect(results).toEqual([2, 4]);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should throw error for invalid limit', async () => {
    const items = [1, 2, 3];
    const fn = vi.fn();

    await expect(mapLimit(items, 0, fn)).rejects.toThrow('Limit must be greater than 0');
    await expect(mapLimit(items, -1, fn)).rejects.toThrow('Limit must be greater than 0');
  });

  it('should handle function errors', async () => {
    const items = [1, 2, 3];
    const fn = vi.fn().mockImplementation(async (item: number) => {
      if (item === 2) throw new Error('Item 2 failed');
      return item * 2;
    });

    await expect(mapLimit(items, 2, fn)).rejects.toThrow('Error processing item at index 1: Error: Item 2 failed');
  });

  it('should handle undefined items', async () => {
    const items = [1, undefined, 3] as (number | undefined)[];
    const fn = vi.fn().mockImplementation(async (item: number | undefined) => {
      if (item === undefined) throw new Error('Item is undefined');
      return item * 2;
    });

    await expect(mapLimit(items, 2, fn)).rejects.toThrow('Item at index 1 is undefined');
  });
});
