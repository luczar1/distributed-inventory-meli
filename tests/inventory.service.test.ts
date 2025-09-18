import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { inventoryService } from '../src/services/inventory.service';
import { inventoryRepository } from '../src/repositories/inventory.repo';
import { eventLogRepository } from '../src/repositories/eventlog.repo';
import { idempotencyStore } from '../src/utils/idempotency';
import { ConflictError, InsufficientStockError } from '../src/core/errors';
import { InventoryRecord } from '../src/core/types';

vi.mock('../src/repositories/inventory.repo');
vi.mock('../src/repositories/eventlog.repo');
vi.mock('../src/utils/idempotency');

describe('InventoryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    idempotencyStore.clear();
  });

  afterEach(() => {
    idempotencyStore.clear();
  });

  describe('adjustStock', () => {
    it('should increase stock correctly and increment version', async () => {
      const mockRecord: InventoryRecord = {
        sku: 'SKU123', storeId: 'STORE001', qty: 100, version: 1, updatedAt: new Date()
      };
      vi.mocked(inventoryRepository.get).mockResolvedValue(mockRecord);
      vi.mocked(inventoryRepository.upsert).mockResolvedValue();
      vi.mocked(eventLogRepository.append).mockResolvedValue();
      const result = await inventoryService.adjustStock('STORE001', 'SKU123', 50, undefined, 'test-key');
      expect(result.success).toBe(true);
      expect(result.newQuantity).toBe(150);
      expect(result.newVersion).toBe(2);
      expect(result.record.qty).toBe(150);
      expect(result.record.version).toBe(2);
      expect(inventoryRepository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ qty: 150, version: 2 })
      );
    });

    it('should decrease stock correctly and increment version', async () => {
      const mockRecord: InventoryRecord = {
        sku: 'SKU123', storeId: 'STORE001', qty: 100, version: 1, updatedAt: new Date()
      };
      vi.mocked(inventoryRepository.get).mockResolvedValue(mockRecord);
      vi.mocked(inventoryRepository.upsert).mockResolvedValue();
      vi.mocked(eventLogRepository.append).mockResolvedValue();
      const result = await inventoryService.adjustStock('STORE001', 'SKU123', -30, undefined, 'test-key');
      expect(result.success).toBe(true);
      expect(result.newQuantity).toBe(70);
      expect(result.newVersion).toBe(2);
    });

    it('should reject negative resulting stock', async () => {
      const mockRecord: InventoryRecord = {
        sku: 'SKU123', storeId: 'STORE001', qty: 50, version: 1, updatedAt: new Date()
      };
      vi.mocked(inventoryRepository.get).mockResolvedValue(mockRecord);
      await expect(
        inventoryService.adjustStock('STORE001', 'SKU123', -100, undefined, 'test-key')
      ).rejects.toThrow(InsufficientStockError);
    });

    it('should throw ConflictError on version mismatch', async () => {
      const mockRecord: InventoryRecord = {
        sku: 'SKU123', storeId: 'STORE001', qty: 100, version: 2, updatedAt: new Date()
      };
      vi.mocked(inventoryRepository.get).mockResolvedValue(mockRecord);
      await expect(
        inventoryService.adjustStock('STORE001', 'SKU123', 50, 1, 'test-key')
      ).rejects.toThrow(ConflictError);
    });

    it('should return same result for repeated idempotency key', async () => {
      const mockRecord: InventoryRecord = {
        sku: 'SKU123', storeId: 'STORE001', qty: 100, version: 1, updatedAt: new Date()
      };
      vi.mocked(inventoryRepository.get).mockResolvedValue(mockRecord);
      vi.mocked(inventoryRepository.upsert).mockResolvedValue();
      vi.mocked(eventLogRepository.append).mockResolvedValue();
      const idempotencyKey = 'test-key-123';
      const result1 = await inventoryService.adjustStock('STORE001', 'SKU123', 50, undefined, idempotencyKey);
      const result2 = await inventoryService.adjustStock('STORE001', 'SKU123', 50, undefined, idempotencyKey);
      expect(result1).toEqual(result2);
      expect(inventoryRepository.upsert).toHaveBeenCalledTimes(1);
    });
  });

  describe('reserveStock', () => {
    it('should reserve stock correctly and increment version', async () => {
      const mockRecord: InventoryRecord = {
        sku: 'SKU123', storeId: 'STORE001', qty: 100, version: 1, updatedAt: new Date()
      };
      vi.mocked(inventoryRepository.get).mockResolvedValue(mockRecord);
      vi.mocked(inventoryRepository.upsert).mockResolvedValue();
      vi.mocked(eventLogRepository.append).mockResolvedValue();
      const result = await inventoryService.reserveStock('STORE001', 'SKU123', 30, undefined, 'test-key');
      expect(result.success).toBe(true);
      expect(result.newQuantity).toBe(70);
      expect(result.newVersion).toBe(2);
    });

    it('should reject reservation if insufficient stock', async () => {
      const mockRecord: InventoryRecord = {
        sku: 'SKU123', storeId: 'STORE001', qty: 50, version: 1, updatedAt: new Date()
      };
      vi.mocked(inventoryRepository.get).mockResolvedValue(mockRecord);
      await expect(
        inventoryService.reserveStock('STORE001', 'SKU123', 100, undefined, 'test-key')
      ).rejects.toThrow(InsufficientStockError);
    });

    it('should throw ConflictError on version mismatch', async () => {
      const mockRecord: InventoryRecord = {
        sku: 'SKU123', storeId: 'STORE001', qty: 100, version: 3, updatedAt: new Date()
      };
      vi.mocked(inventoryRepository.get).mockResolvedValue(mockRecord);
      await expect(
        inventoryService.reserveStock('STORE001', 'SKU123', 30, 2, 'test-key')
      ).rejects.toThrow(ConflictError);
    });

    it('should return same result for repeated idempotency key', async () => {
      const mockRecord: InventoryRecord = {
        sku: 'SKU123', storeId: 'STORE001', qty: 100, version: 1, updatedAt: new Date()
      };
      vi.mocked(inventoryRepository.get).mockResolvedValue(mockRecord);
      vi.mocked(inventoryRepository.upsert).mockResolvedValue();
      vi.mocked(eventLogRepository.append).mockResolvedValue();
      const idempotencyKey = 'test-key-456';
      const result1 = await inventoryService.reserveStock('STORE001', 'SKU123', 30, undefined, idempotencyKey);
      const result2 = await inventoryService.reserveStock('STORE001', 'SKU123', 30, undefined, idempotencyKey);
      expect(result1).toEqual(result2);
      expect(inventoryRepository.upsert).toHaveBeenCalledTimes(1);
    });
  });

  describe('getInventory', () => {
    it('should return inventory record if exists', async () => {
      const mockRecord: InventoryRecord = {
        sku: 'SKU123', storeId: 'STORE001', qty: 100, version: 1, updatedAt: new Date()
      };
      vi.mocked(inventoryRepository.get).mockResolvedValue(mockRecord);
      const result = await inventoryService.getInventory('SKU123', 'STORE001');
      expect(result).toEqual(mockRecord);
      expect(inventoryRepository.get).toHaveBeenCalledWith('SKU123', 'STORE001');
    });

    it('should return null if record does not exist', async () => {
      vi.mocked(inventoryRepository.get).mockResolvedValue(null);
      const result = await inventoryService.getInventory('SKU123', 'STORE001');
      expect(result).toBeNull();
    });
  });
});
