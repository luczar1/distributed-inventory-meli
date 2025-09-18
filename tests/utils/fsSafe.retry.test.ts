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

describe('fsSafe - Retry Mechanism', () => {
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

  describe('readJsonFile retry', () => {
    it('should retry on failure with exponential backoff', async () => {
      const filePath = '/test/file.json';
      const data = { key: 'value' };
      
      // First two attempts fail, third succeeds
      mockFs.readFile
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockRejectedValueOnce(new Error('Second attempt failed'))
        .mockResolvedValue(JSON.stringify(data));

      const result = await readJsonFile(filePath);

      expect(result).toEqual(data);
      expect(mockFs.readFile).toHaveBeenCalledTimes(3);
    });

    it('should throw error after all retries fail', async () => {
      const filePath = '/test/file.json';
      const error = new Error('Persistent failure');
      mockFs.readFile.mockRejectedValue(error);

      await expect(readJsonFile(filePath)).rejects.toThrow('Failed to read file /test/file.json after 3 attempts');
      expect(mockFs.readFile).toHaveBeenCalledTimes(3);
    });
  });

  describe('writeJsonFile retry', () => {
    it('should retry on failure with exponential backoff', async () => {
      const filePath = '/test/file.json';
      const data = { key: 'value' };
      
      // First two attempts fail, third succeeds
      mockFs.writeFile
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockRejectedValueOnce(new Error('Second attempt failed'))
        .mockResolvedValue(undefined);

      await writeJsonFile(filePath, data);

      expect(mockFs.writeFile).toHaveBeenCalledTimes(3);
    });

    it('should throw error after all retries fail', async () => {
      const filePath = '/test/file.json';
      const data = { key: 'value' };
      const error = new Error('Persistent failure');
      mockFs.writeFile.mockRejectedValue(error);

      await expect(writeJsonFile(filePath, data)).rejects.toThrow('Failed to write file /test/file.json after 3 attempts');
      expect(mockFs.writeFile).toHaveBeenCalledTimes(3);
    });

    it('should use exponential backoff for retries', async () => {
      const filePath = '/test/file.json';
      const data = { key: 'value' };
      
      // Mock setTimeout to track delays
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
      
      mockFs.writeFile
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockRejectedValueOnce(new Error('Second attempt failed'))
        .mockResolvedValue(undefined);

      await writeJsonFile(filePath, data);

      // Should have called setTimeout for delays
      expect(setTimeoutSpy).toHaveBeenCalled();
    });

    it('should handle different error types', async () => {
      const filePath = '/test/file.json';
      const data = { key: 'value' };
      
      mockFs.writeFile
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Permission denied'))
        .mockResolvedValue(undefined);

      await writeJsonFile(filePath, data);

      expect(mockFs.writeFile).toHaveBeenCalledTimes(3);
    });
  });
});
