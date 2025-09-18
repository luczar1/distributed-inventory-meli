import { describe, it, expect, beforeEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { 
  readJsonFile, 
  writeJsonFile, 
  fileExists, 
  ensureDir, 
  deleteFile 
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

// Mock config for faster tests
vi.mock('../../src/core/config', () => ({
  config: {
    RETRY_BASE_MS: 10,
    RETRY_TIMES: 2,
  },
}));

describe('fsSafe - Basic Operations', () => {
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

  describe('readJsonFile', () => {
    it('should read and parse JSON file successfully', async () => {
      const filePath = '/test/file.json';
      const data = { key: 'value', number: 42 };
      mockFs.readFile.mockResolvedValue(JSON.stringify(data));

      const result = await readJsonFile(filePath);

      expect(result).toEqual(data);
      expect(mockFs.readFile).toHaveBeenCalledWith(filePath, 'utf8');
    });

    it('should handle JSON parse errors', async () => {
      const filePath = '/test/file.json';
      mockFs.readFile.mockResolvedValue('invalid json');

      await expect(readJsonFile(filePath)).rejects.toThrow();
    }, 10000);
  });

  describe('writeJsonFile', () => {
    it('should write JSON file successfully', async () => {
      const filePath = '/test/file.json';
      const data = { key: 'value', number: 42 };
      mockFs.writeFile.mockResolvedValue(undefined);

      await writeJsonFile(filePath, data);

      expect(mockFs.writeFile).toHaveBeenCalledWith(filePath, JSON.stringify(data, null, 2), 'utf8');
    });

    it('should handle different data types', async () => {
      const filePath = '/test/file.json';
      mockFs.writeFile.mockResolvedValue(undefined);

      await writeJsonFile(filePath, 'string');
      expect(mockFs.writeFile).toHaveBeenCalledWith(filePath, JSON.stringify('string', null, 2), 'utf8');

      await writeJsonFile(filePath, 42);
      expect(mockFs.writeFile).toHaveBeenCalledWith(filePath, JSON.stringify(42, null, 2), 'utf8');

      await writeJsonFile(filePath, [1, 2, 3]);
      expect(mockFs.writeFile).toHaveBeenCalledWith(filePath, JSON.stringify([1, 2, 3], null, 2), 'utf8');
    });
  });

  describe('fileExists', () => {
    it('should return true when file exists', async () => {
      const filePath = '/test/file.json';
      mockFs.access.mockResolvedValue(undefined);

      const exists = await fileExists(filePath);

      expect(exists).toBe(true);
      expect(mockFs.access).toHaveBeenCalledWith(filePath);
    });

    it('should return false when file does not exist', async () => {
      const filePath = '/test/file.json';
      mockFs.access.mockRejectedValue(new Error('File not found'));

      const exists = await fileExists(filePath);

      expect(exists).toBe(false);
      expect(mockFs.access).toHaveBeenCalledWith(filePath);
    }, 10000);
  });

  describe('ensureDir', () => {
    it('should create directory successfully', async () => {
      const dirPath = '/test/directory';
      mockFs.mkdir.mockResolvedValue(undefined);

      await ensureDir(dirPath);

      expect(mockFs.mkdir).toHaveBeenCalledWith(dirPath, { recursive: true });
    });

    it('should throw error on failure', async () => {
      const dirPath = '/test/directory';
      const error = new Error('Permission denied');
      mockFs.mkdir.mockRejectedValue(error);

      await expect(ensureDir(dirPath)).rejects.toThrow('Permission denied');
    }, 10000);
  });

  describe('deleteFile', () => {
    it('should delete file successfully', async () => {
      const filePath = '/test/file.json';
      mockFs.unlink.mockResolvedValue(undefined);

      await deleteFile(filePath);

      expect(mockFs.unlink).toHaveBeenCalledWith(filePath);
    });

    it('should throw error on failure', async () => {
      const filePath = '/test/file.json';
      const error = new Error('File not found');
      mockFs.unlink.mockRejectedValue(error);

      await expect(deleteFile(filePath)).rejects.toThrow('File not found');
    }, 10000);
  });
});