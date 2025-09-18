import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { InventoryRepository } from '../../src/repositories/inventory.repo';
import { InventoryRecord } from '../../src/core/types';
import { NotFoundError } from '../../src/core/errors';

// Mock fsSafe utilities
vi.mock('../../src/utils/fsSafe', () => ({
  readJsonFile: vi.fn(),
  writeJsonFile: vi.fn(),
  ensureDir: vi.fn(),
}));

vi.mock('../../src/core/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('InventoryRepository', () => {
  let repo: InventoryRepository;
  let mockData: any;

  beforeEach(() => {
    repo = new InventoryRepository();
    mockData = {
      'STORE001': {
        'SKU123': {
          sku: 'SKU123',
          storeId: 'STORE001',
          qty: 100,
          version: 1,
          updatedAt: new Date('2023-01-01T00:00:00Z'),
        },
      },
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('get', () => {
    it('should return inventory record when found', async () => {
      const { readJsonFile } = await import('../../src/utils/fsSafe');
      vi.mocked(readJsonFile).mockResolvedValue(mockData);

      const result = await repo.get('SKU123', 'STORE001');

      expect(result).toEqual(mockData['STORE001']['SKU123']);
    });

    it('should throw NotFoundError when store not found', async () => {
      const { readJsonFile } = await import('../../src/utils/fsSafe');
      vi.mocked(readJsonFile).mockResolvedValue({});

      await expect(repo.get('SKU123', 'STORE999')).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError when SKU not found', async () => {
      const { readJsonFile } = await import('../../src/utils/fsSafe');
      vi.mocked(readJsonFile).mockResolvedValue(mockData);

      await expect(repo.get('SKU999', 'STORE001')).rejects.toThrow(NotFoundError);
    });
  });

  describe('upsert', () => {
    it('should create new record', async () => {
      const { readJsonFile, writeJsonFile } = await import('../../src/utils/fsSafe');
      vi.mocked(readJsonFile).mockResolvedValue({});
      
      const newRecord: InventoryRecord = {
        sku: 'SKU456',
        storeId: 'STORE002',
        qty: 50,
        version: 1,
        updatedAt: new Date(),
      };

      await repo.upsert(newRecord);

      expect(writeJsonFile).toHaveBeenCalledWith(
        expect.stringContaining('store-inventory.json'),
        {
          'STORE002': {
            'SKU456': newRecord,
          },
        }
      );
    });

    it('should update existing record', async () => {
      const { readJsonFile, writeJsonFile } = await import('../../src/utils/fsSafe');
      vi.mocked(readJsonFile).mockResolvedValue(mockData);
      
      const updatedRecord: InventoryRecord = {
        sku: 'SKU123',
        storeId: 'STORE001',
        qty: 150,
        version: 2,
        updatedAt: new Date(),
      };

      await repo.upsert(updatedRecord);

      expect(writeJsonFile).toHaveBeenCalledWith(
        expect.stringContaining('store-inventory.json'),
        {
          'STORE001': {
            'SKU123': updatedRecord,
          },
        }
      );
    });
  });

  describe('listByStore', () => {
    it('should return all records for a store', async () => {
      const { readJsonFile } = await import('../../src/utils/fsSafe');
      vi.mocked(readJsonFile).mockResolvedValue(mockData);

      const result = await repo.listByStore('STORE001');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockData['STORE001']['SKU123']);
    });

    it('should return empty array for non-existent store', async () => {
      const { readJsonFile } = await import('../../src/utils/fsSafe');
      vi.mocked(readJsonFile).mockResolvedValue({});

      const result = await repo.listByStore('STORE999');

      expect(result).toEqual([]);
    });
  });

  describe('listStores', () => {
    it('should return all store IDs', async () => {
      const { readJsonFile } = await import('../../src/utils/fsSafe');
      vi.mocked(readJsonFile).mockResolvedValue(mockData);

      const result = await repo.listStores();

      expect(result).toEqual(['STORE001']);
    });
  });

  describe('delete', () => {
    it('should delete existing record', async () => {
      const { readJsonFile, writeJsonFile } = await import('../../src/utils/fsSafe');
      vi.mocked(readJsonFile).mockResolvedValue(mockData);

      await repo.delete('SKU123', 'STORE001');

      expect(writeJsonFile).toHaveBeenCalledWith(
        expect.stringContaining('store-inventory.json'),
        {}
      );
    });

    it('should throw NotFoundError when record not found', async () => {
      const { readJsonFile } = await import('../../src/utils/fsSafe');
      vi.mocked(readJsonFile).mockResolvedValue({});

      await expect(repo.delete('SKU999', 'STORE001')).rejects.toThrow(NotFoundError);
    });
  });

  describe('getTotalCount', () => {
    it('should return total count of all records', async () => {
      const { readJsonFile } = await import('../../src/utils/fsSafe');
      vi.mocked(readJsonFile).mockResolvedValue(mockData);

      const result = await repo.getTotalCount();

      expect(result).toBe(1);
    });
  });
});
