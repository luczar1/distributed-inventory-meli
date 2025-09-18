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

// Mock config with shorter retry times for testing
vi.mock('../../src/core/config', () => ({
  config: {
    RETRY_BASE_MS: 10, // Shorter delays for testing
    RETRY_TIMES: 2,    // Fewer retries for testing
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

describe('Transient FS Error Recovery', () => {
  const testFilePath = '/test/data.json';
  const testData = { id: 1, name: 'test', value: 42 };
  const expectedJson = JSON.stringify(testData, null, 2);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Transient Write Errors', () => {
    it('should recover from transient writeFile errors', async () => {
      const tempPath = join('/test', '.test-uuid-123.tmp');
      
      // First attempt fails, second succeeds
      vi.mocked(fs.writeFile)
        .mockRejectedValueOnce(new Error('Transient write error'))
        .mockResolvedValueOnce(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      await writeJsonAtomic(testFilePath, testData);

      expect(fs.writeFile).toHaveBeenCalledTimes(2);
      expect(fs.writeFile).toHaveBeenNthCalledWith(1, tempPath, expectedJson, 'utf8');
      expect(fs.writeFile).toHaveBeenNthCalledWith(2, tempPath, expectedJson, 'utf8');
      expect(fs.rename).toHaveBeenCalledWith(tempPath, testFilePath);
    });

    it('should recover from transient rename errors', async () => {
      const tempPath = join('/test', '.test-uuid-123.tmp');
      
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      // First rename fails, second succeeds
      vi.mocked(fs.rename)
        .mockRejectedValueOnce(new Error('Transient rename error'))
        .mockResolvedValueOnce(undefined);

      await writeJsonAtomic(testFilePath, testData);

      expect(fs.writeFile).toHaveBeenCalledTimes(2); // Called twice due to retry
      expect(fs.rename).toHaveBeenCalledTimes(2);
      expect(fs.rename).toHaveBeenNthCalledWith(1, tempPath, testFilePath);
      expect(fs.rename).toHaveBeenNthCalledWith(2, tempPath, testFilePath);
    });

    it('should recover from mixed transient errors', async () => {
      const tempPath = join('/test', '.test-uuid-123.tmp');
      
      // First attempt: write fails
      // Second attempt: write succeeds, rename fails
      // Third attempt: both succeed
      vi.mocked(fs.writeFile)
        .mockRejectedValueOnce(new Error('Transient write error'))
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);
      
      vi.mocked(fs.rename)
        .mockRejectedValueOnce(new Error('Transient rename error'))
        .mockResolvedValueOnce(undefined);

      await writeJsonAtomic(testFilePath, testData);

      expect(fs.writeFile).toHaveBeenCalledTimes(3);
      expect(fs.rename).toHaveBeenCalledTimes(2);
    });

    it('should fail after exhausting all retries', async () => {
      const tempPath = join('/test', '.test-uuid-123.tmp');
      
      // All attempts fail
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('Persistent write error'));
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      await expect(writeJsonAtomic(testFilePath, testData))
        .rejects.toThrow('Atomic file write failed after 3 attempts: Persistent write error');

      expect(fs.writeFile).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });
  });

  describe('Transient Read Errors', () => {
    it('should recover from transient readFile errors', async () => {
      // First attempt fails, second succeeds
      vi.mocked(fs.readFile)
        .mockRejectedValueOnce(new Error('Transient read error'))
        .mockResolvedValueOnce(expectedJson);

      const result = await readJsonFile(testFilePath);

      expect(result).toEqual(testData);
      expect(fs.readFile).toHaveBeenCalledTimes(2);
    });

    it('should recover from transient JSON parse errors', async () => {
      // First attempt returns invalid JSON, second succeeds
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce('invalid json')
        .mockResolvedValueOnce(expectedJson);

      const result = await readJsonFile(testFilePath);

      expect(result).toEqual(testData);
      expect(fs.readFile).toHaveBeenCalledTimes(2);
    });

    it('should fail after exhausting all retries', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('Persistent read error'));

      await expect(readJsonFile(testFilePath))
        .rejects.toThrow('File read failed after 3 attempts: Persistent read error');

      expect(fs.readFile).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });
  });

  describe('Transient withFsRetry Errors', () => {
    it('should recover from transient operation errors', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Transient error 1'))
        .mockRejectedValueOnce(new Error('Transient error 2'))
        .mockResolvedValue('success');

      const result = await withFsRetry(operation, 'Test operation', { test: 'context' });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should handle different error types', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Permission denied'))
        .mockResolvedValue('success');

      const result = await withFsRetry(operation, 'Test operation', { test: 'context' });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should fail with last error message after all retries', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockRejectedValueOnce(new Error('Final error'));

      await expect(withFsRetry(operation, 'Test operation', { test: 'context' }))
        .rejects.toThrow('Test operation failed after 3 attempts: Final error');

      expect(operation).toHaveBeenCalledTimes(3);
    });
  });

  describe('Network-like Transient Errors', () => {
    it('should recover from ENOENT (file not found) errors', async () => {
      const tempPath = join('/test', '.test-uuid-123.tmp');
      
      const enoentError = new Error('ENOENT: no such file or directory');
      (enoentError as any).code = 'ENOENT';
      
      vi.mocked(fs.writeFile)
        .mockRejectedValueOnce(enoentError)
        .mockResolvedValueOnce(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      await writeJsonAtomic(testFilePath, testData);

      expect(fs.writeFile).toHaveBeenCalledTimes(2);
      expect(fs.rename).toHaveBeenCalledWith(tempPath, testFilePath);
    });

    it('should recover from EACCES (permission denied) errors', async () => {
      const tempPath = join('/test', '.test-uuid-123.tmp');
      
      const eaccesError = new Error('EACCES: permission denied');
      (eaccesError as any).code = 'EACCES';
      
      vi.mocked(fs.writeFile)
        .mockRejectedValueOnce(eaccesError)
        .mockResolvedValueOnce(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      await writeJsonAtomic(testFilePath, testData);

      expect(fs.writeFile).toHaveBeenCalledTimes(2);
      expect(fs.rename).toHaveBeenCalledWith(tempPath, testFilePath);
    });

    it('should recover from EBUSY (device or resource busy) errors', async () => {
      const tempPath = join('/test', '.test-uuid-123.tmp');
      
      const ebusyError = new Error('EBUSY: device or resource busy');
      (ebusyError as any).code = 'EBUSY';
      
      vi.mocked(fs.writeFile)
        .mockRejectedValueOnce(ebusyError)
        .mockResolvedValueOnce(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      await writeJsonAtomic(testFilePath, testData);

      expect(fs.writeFile).toHaveBeenCalledTimes(2);
      expect(fs.rename).toHaveBeenCalledWith(tempPath, testFilePath);
    });

    it('should recover from EMFILE (too many open files) errors', async () => {
      const tempPath = join('/test', '.test-uuid-123.tmp');
      
      const emfileError = new Error('EMFILE: too many open files');
      (emfileError as any).code = 'EMFILE';
      
      vi.mocked(fs.writeFile)
        .mockRejectedValueOnce(emfileError)
        .mockResolvedValueOnce(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      await writeJsonAtomic(testFilePath, testData);

      expect(fs.writeFile).toHaveBeenCalledTimes(2);
      expect(fs.rename).toHaveBeenCalledWith(tempPath, testFilePath);
    });
  });

  describe('Timing and Backoff', () => {
    it('should use exponential backoff with jitter', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockResolvedValue('success');

      const startTime = Date.now();
      await withFsRetry(operation, 'Test operation', { test: 'context' });
      const endTime = Date.now();

      // Should have waited at least 10ms + 20ms = 30ms (with jitter)
      expect(endTime - startTime).toBeGreaterThanOrEqual(25);
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should handle rapid successive failures', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Rapid failures'));

      const startTime = Date.now();
      await expect(withFsRetry(operation, 'Test operation', { test: 'context' }))
        .rejects.toThrow();
      const endTime = Date.now();

      // Should have waited for backoff delays
      expect(endTime - startTime).toBeGreaterThanOrEqual(25);
      expect(operation).toHaveBeenCalledTimes(3);
    });
  });

  describe('Cleanup on Failure', () => {
    it('should clean up temp files on persistent write failures', async () => {
      const tempPath = join('/test', '.test-uuid-123.tmp');
      
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('Persistent write error'));
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      await expect(writeJsonAtomic(testFilePath, testData))
        .rejects.toThrow();

      expect(fs.unlink).toHaveBeenCalledTimes(3); // Once for each failed attempt
    });

    it('should handle cleanup failures gracefully', async () => {
      const tempPath = join('/test', '.test-uuid-123.tmp');
      
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('Persistent write error'));
      vi.mocked(fs.unlink).mockRejectedValue(new Error('Cleanup failed'));

      await expect(writeJsonAtomic(testFilePath, testData))
        .rejects.toThrow('Atomic file write failed after 3 attempts: Persistent write error');

      expect(fs.unlink).toHaveBeenCalledTimes(3);
    });
  });
});
