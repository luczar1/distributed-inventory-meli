import { describe, it, expect, beforeEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { 
  readJsonFile, 
  writeJsonFile
} from '../../src/utils/fsSafe';

// Mock fs module
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    access: vi.fn(),
    mkdir: vi.fn(),
    unlink: vi.fn(),
  },
}));

describe('fsSafe - Type Safety', () => {
  const mockFs = fs as unknown as {
    readFile: ReturnType<typeof vi.fn>;
    writeFile: ReturnType<typeof vi.fn>;
    access: ReturnType<typeof vi.fn>;
    mkdir: ReturnType<typeof vi.fn>;
    unlink: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle generic types', async () => {
    const filePath = '/test/file.json';
    mockFs.readFile.mockResolvedValue('{"key": "value"}');

    const result = await readJsonFile<{ key: string }>(filePath);
    expect(result).toEqual({ key: 'value' });
  });

  it('should handle complex objects', async () => {
    const filePath = '/test/file.json';
    const complexData = {
      string: 'value',
      number: 42,
      boolean: true,
      array: [1, 2, 3],
      object: { nested: 'value' },
      null: null,
    };
    mockFs.writeFile.mockResolvedValue(undefined);

    await writeJsonFile(filePath, complexData);

    expect(mockFs.writeFile).toHaveBeenCalledWith(
      filePath,
      JSON.stringify(complexData, null, 2),
      'utf8'
    );
  });
});
