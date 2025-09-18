import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import { readJsonFile, writeJsonFile } from '../../src/utils/fsSafe';

// Mock fs module
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
  },
}));

// Mock config for faster tests
vi.mock('../../src/core/config', () => ({
  config: {
    RETRY_BASE_MS: 10,
    RETRY_TIMES: 2,
  },
}));

describe('fsSafe - Retry Mechanism', () => {
  const mockFs = fs as unknown as {
    readFile: ReturnType<typeof vi.fn>;
    writeFile: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('readJsonFile retry', () => {
    it('should succeed on second attempt', async () => {
      const filePath = '/test/file.json';
      const data = { key: 'value' };
      
      mockFs.readFile
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockResolvedValueOnce(JSON.stringify(data));

      const result = await readJsonFile(filePath);

      expect(result).toEqual(data);
      expect(mockFs.readFile).toHaveBeenCalledTimes(2);
    });

    it('should throw error after all retries fail', async () => {
      const filePath = '/test/file.json';
      const error = new Error('Persistent failure');
      mockFs.readFile.mockRejectedValue(error);

      await expect(readJsonFile(filePath)).rejects.toThrow('Persistent failure');
      expect(mockFs.readFile).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    }, 10000);
  });

  describe('writeJsonFile retry', () => {
    it('should succeed on second attempt', async () => {
      const filePath = '/test/file.json';
      const data = { key: 'value' };
      
      mockFs.writeFile
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockResolvedValueOnce(undefined);

      await writeJsonFile(filePath, data);

      expect(mockFs.writeFile).toHaveBeenCalledTimes(2);
    });

    it('should throw error after all retries fail', async () => {
      const filePath = '/test/file.json';
      const data = { key: 'value' };
      const error = new Error('Persistent failure');
      mockFs.writeFile.mockRejectedValue(error);

      await expect(writeJsonFile(filePath, data)).rejects.toThrow('Persistent failure');
      expect(mockFs.writeFile).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    }, 10000);
  });
});