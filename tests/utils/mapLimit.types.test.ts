import { describe, it, expect, vi } from 'vitest';
import { mapLimit } from '../../src/utils/mapLimit';

describe('mapLimit - Type Safety', () => {
  it('should handle different input and output types', async () => {
    const items = ['a', 'b', 'c'];
    const fn = vi.fn().mockImplementation(async (item: string) => item.toUpperCase());

    const results = await mapLimit(items, 2, fn);

    expect(results).toEqual(['A', 'B', 'C']);
  });

  it('should handle complex objects', async () => {
    const items = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ];
    const fn = vi.fn().mockImplementation(async (item: { id: number; name: string }) => ({
      ...item,
      processed: true,
    }));

    const results = await mapLimit(items, 2, fn);

    expect(results).toEqual([
      { id: 1, name: 'Alice', processed: true },
      { id: 2, name: 'Bob', processed: true },
    ]);
  });
});
