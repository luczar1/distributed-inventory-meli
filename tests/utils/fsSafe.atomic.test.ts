import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { writeJsonAtomic, readJsonFile, withFsRetry } from '../../src/utils/fsSafe';

// Mock fs operations
vi.mock('fs', () => ({
  promises: {
    writeFile: vi.fn(),
    readFile: vi.fn(),
    rename: vi.fn(),
    unlink: vi.fn(),
    access: vi.fn(),
    mkdir: vi.fn(),
  },
}));

// Mock crypto
vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => 'test-uuid-123'),
}));

// Mock config
vi.mock('../../src/core/config', () => ({
  config: {
    RETRY_BASE_MS: 100,
    RETRY_TIMES: 3,
  },
}));

// Mock logger
vi.mock('../../src/core/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Atomic JSON Operations', () => {
  const testFilePath = '/test/data.json';
  const testData = { id: 1, name: 'test', value: 42 };
  const expectedJson = JSON.stringify(testData, null, 2);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('writeJsonAtomic', () => {
    it('should write data atomically using temp file and rename', async () => {
      const tempPath = join('/test', '.test-uuid-123.tmp');
      
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      await writeJsonAtomic(testFilePath, testData);

      expect(fs.writeFile).toHaveBeenCalledWith(tempPath, expectedJson, 'utf8');
      expect(fs.rename).toHaveBeenCalledWith(tempPath, testFilePath);
    });

    it('should clean up temp file on write failure', async () => {
      const tempPath = join('/test', '.test-uuid-123.tmp');
      
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('Write failed'));
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      await expect(writeJsonAtomic(testFilePath, testData)).rejects.toThrow('Write failed');

      expect(fs.writeFile).toHaveBeenCalledWith(tempPath, expectedJson, 'utf8');
      expect(fs.unlink).toHaveBeenCalledWith(tempPath);
    });

    it('should clean up temp file on rename failure', async () => {
      const tempPath = join('/test', '.test-uuid-123.tmp');
      
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockRejectedValue(new Error('Rename failed'));
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      await expect(writeJsonAtomic(testFilePath, testData)).rejects.toThrow('Rename failed');

      expect(fs.writeFile).toHaveBeenCalledWith(tempPath, expectedJson, 'utf8');
      expect(fs.rename).toHaveBeenCalledWith(tempPath, testFilePath);
      expect(fs.unlink).toHaveBeenCalledWith(tempPath);
    });

    it('should ignore cleanup errors during temp file deletion', async () => {
      const tempPath = join('/test', '.test-uuid-123.tmp');
      
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('Write failed'));
      vi.mocked(fs.unlink).mockRejectedValue(new Error('Cleanup failed'));

      await expect(writeJsonAtomic(testFilePath, testData)).rejects.toThrow('Write failed');

      expect(fs.writeFile).toHaveBeenCalledWith(tempPath, expectedJson, 'utf8');
      expect(fs.unlink).toHaveBeenCalledWith(tempPath);
    });
  });

  describe('readJsonFile', () => {
    it('should read and parse JSON file successfully', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(expectedJson);

      const result = await readJsonFile(testFilePath);

      expect(result).toEqual(testData);
      expect(fs.readFile).toHaveBeenCalledWith(testFilePath, 'utf8');
    });

    it('should handle JSON parse errors', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('invalid json');

      await expect(readJsonFile(testFilePath)).rejects.toThrow();
    });
  });

  describe('withFsRetry', () => {
    it('should succeed on first attempt', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const result = await withFsRetry(operation, 'Test operation', { test: 'context' });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockRejectedValueOnce(new Error('Second attempt failed'))
        .mockResolvedValue('success');

      const result = await withFsRetry(operation, 'Test operation', { test: 'context' });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should fail after all retries exhausted', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Persistent failure'));

      await expect(withFsRetry(operation, 'Test operation', { test: 'context' }))
        .rejects.toThrow('Test operation failed after 4 attempts: Persistent failure');

      expect(operation).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    });

    it('should use exponential backoff with jitter', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockResolvedValue('success');

      const startTime = Date.now();
      await withFsRetry(operation, 'Test operation', { test: 'context' });
      const endTime = Date.now();

      // Should have waited at least 100ms (base delay)
      expect(endTime - startTime).toBeGreaterThanOrEqual(100);
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should pass context to logger', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Test error'));

      await expect(withFsRetry(operation, 'Test operation', { custom: 'context' }))
        .rejects.toThrow();

      // Verify logger was called with context
      const { logger } = await import('../../src/core/logger');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          custom: 'context',
          operationName: 'Test operation',
          attempt: 1,
          error: 'Test error',
        }),
        'Test operation attempt failed'
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty data in atomic write', async () => {
      const emptyData = {};
      const expectedJson = JSON.stringify(emptyData, null, 2);
      const tempPath = join('/test', '.test-uuid-123.tmp');
      
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      await writeJsonAtomic(testFilePath, emptyData);

      expect(fs.writeFile).toHaveBeenCalledWith(tempPath, expectedJson, 'utf8');
      expect(fs.rename).toHaveBeenCalledWith(tempPath, testFilePath);
    });

    it('should handle null data in atomic write', async () => {
      const nullData = null;
      const expectedJson = JSON.stringify(nullData, null, 2);
      const tempPath = join('/test', '.test-uuid-123.tmp');
      
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      await writeJsonAtomic(testFilePath, nullData);

      expect(fs.writeFile).toHaveBeenCalledWith(tempPath, expectedJson, 'utf8');
      expect(fs.rename).toHaveBeenCalledWith(tempPath, testFilePath);
    });

    it('should handle large data in atomic write', async () => {
      const largeData = {
        items: Array.from({ length: 1000 }, (_, i) => ({ id: i, data: `item-${i}` }))
      };
      const expectedJson = JSON.stringify(largeData, null, 2);
      const tempPath = join('/test', '.test-uuid-123.tmp');
      
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      await writeJsonAtomic(testFilePath, largeData);

      expect(fs.writeFile).toHaveBeenCalledWith(tempPath, expectedJson, 'utf8');
      expect(fs.rename).toHaveBeenCalledWith(tempPath, testFilePath);
    });

    it('should handle special characters in file path', async () => {
      const specialPath = '/test/path with spaces/特殊字符.json';
      const tempPath = join('/test/path with spaces', '.test-uuid-123.tmp');
      
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      await writeJsonAtomic(specialPath, testData);

      expect(fs.writeFile).toHaveBeenCalledWith(tempPath, expectedJson, 'utf8');
      expect(fs.rename).toHaveBeenCalledWith(tempPath, specialPath);
    });
  });

  describe('Concurrency', () => {
    it('should handle concurrent atomic writes to same file', async () => {
      const tempPath1 = join('/test', '.test-uuid-123.tmp');
      const tempPath2 = join('/test', '.test-uuid-123.tmp');
      
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      // Simulate concurrent writes
      const write1 = writeJsonAtomic(testFilePath, { id: 1 });
      const write2 = writeJsonAtomic(testFilePath, { id: 2 });

      await Promise.all([write1, write2]);

      expect(fs.writeFile).toHaveBeenCalledTimes(2);
      expect(fs.rename).toHaveBeenCalledTimes(2);
    });

    it('should handle concurrent reads during atomic write', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(expectedJson);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      // Simulate concurrent read and write
      const read = readJsonFile(testFilePath);
      const write = writeJsonAtomic(testFilePath, testData);

      const [readResult] = await Promise.all([read, write]);

      expect(readResult).toEqual(testData);
      expect(fs.readFile).toHaveBeenCalledWith(testFilePath, 'utf8');
    });
  });
});
