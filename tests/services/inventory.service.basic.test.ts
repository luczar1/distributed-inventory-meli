import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { inventoryService } from '../../src/services/inventory.service';
import { ConflictError, InsufficientStockError } from '../../src/core/errors';
// import { NotFoundError } from '../../src/core/errors'; // Not used in this file
import { InventoryRecord } from '../../src/core/types';

// Mock dependencies
vi.mock('../../src/repositories/inventory.repo', () => ({
  inventoryRepository: {
    get: vi.fn(),
    upsert: vi.fn(),
  },
}));

vi.mock('../../src/repositories/eventlog.repo', () => ({
  eventLogRepository: {
    append: vi.fn(),
  },
}));

vi.mock('../../src/utils/perKeyMutex', () => ({
  perKeyMutex: {
    acquire: vi.fn(),
  },
}));

vi.mock('../../src/utils/idempotency', () => ({
  idempotencyStore: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock('../../src/core/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('InventoryService - Basic Operations', () => {
  let mockInventoryRecord: InventoryRecord;

  beforeEach(() => {
    mockInventoryRecord = {
      sku: 'SKU123',
      storeId: 'STORE001',
      qty: 100,
      version: 1,
      updatedAt: new Date('2023-01-01T00:00:00Z'),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('adjustStock', () => {
    it('should adjust stock successfully', async () => {
      const { inventoryRepository } = await import('../../src/repositories/inventory.repo');
      const { eventLogRepository } = await import('../../src/repositories/eventlog.repo');
      const { perKeyMutex } = await import('../../src/utils/perKeyMutex');
      const { idempotencyStore } = await import('../../src/utils/idempotency');

      vi.mocked(idempotencyStore.get).mockResolvedValue(null);
      vi.mocked(inventoryRepository.get).mockResolvedValue(mockInventoryRecord);
      vi.mocked(perKeyMutex.acquire).mockImplementation(async (key, fn) => fn());

      const result = await inventoryService.adjustStock('STORE001', 'SKU123', 50);

      expect(result.qty).toBe(150);
      expect(result.version).toBe(2);
      expect(inventoryRepository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          qty: 150,
          version: 2,
        })
      );
      expect(eventLogRepository.append).toHaveBeenCalled();
    });

    it('should handle negative adjustments', async () => {
      const { inventoryRepository } = await import('../../src/repositories/inventory.repo');
      const { perKeyMutex } = await import('../../src/utils/perKeyMutex');
      const { idempotencyStore } = await import('../../src/utils/idempotency');

      vi.mocked(idempotencyStore.get).mockResolvedValue(null);
      vi.mocked(inventoryRepository.get).mockResolvedValue(mockInventoryRecord);
      vi.mocked(perKeyMutex.acquire).mockImplementation(async (key, fn) => fn());

      const result = await inventoryService.adjustStock('STORE001', 'SKU123', -30);

      expect(result.qty).toBe(70);
      expect(result.version).toBe(2);
    });

    it('should throw ConflictError on version mismatch', async () => {
      const { inventoryRepository } = await import('../../src/repositories/inventory.repo');
      const { perKeyMutex } = await import('../../src/utils/perKeyMutex');
      const { idempotencyStore } = await import('../../src/utils/idempotency');

      vi.mocked(idempotencyStore.get).mockResolvedValue(null);
      vi.mocked(inventoryRepository.get).mockResolvedValue(mockInventoryRecord);
      vi.mocked(perKeyMutex.acquire).mockImplementation(async (key, fn) => fn());

      await expect(
        inventoryService.adjustStock('STORE001', 'SKU123', 50, 5)
      ).rejects.toThrow(ConflictError);
    });

    it('should throw InsufficientStockError for negative result', async () => {
      const { inventoryRepository } = await import('../../src/repositories/inventory.repo');
      const { perKeyMutex } = await import('../../src/utils/perKeyMutex');
      const { idempotencyStore } = await import('../../src/utils/idempotency');

      vi.mocked(idempotencyStore.get).mockResolvedValue(null);
      vi.mocked(inventoryRepository.get).mockResolvedValue(mockInventoryRecord);
      vi.mocked(perKeyMutex.acquire).mockImplementation(async (key, fn) => fn());

      await expect(
        inventoryService.adjustStock('STORE001', 'SKU123', -150)
      ).rejects.toThrow(InsufficientStockError);
    });
  });

  describe('reserveStock', () => {
    it('should reserve stock successfully', async () => {
      const { inventoryRepository } = await import('../../src/repositories/inventory.repo');
      const { eventLogRepository } = await import('../../src/repositories/eventlog.repo');
      const { perKeyMutex } = await import('../../src/utils/perKeyMutex');
      const { idempotencyStore } = await import('../../src/utils/idempotency');

      vi.mocked(idempotencyStore.get).mockResolvedValue(null);
      vi.mocked(inventoryRepository.get).mockResolvedValue(mockInventoryRecord);
      vi.mocked(perKeyMutex.acquire).mockImplementation(async (key, fn) => fn());

      const result = await inventoryService.reserveStock('STORE001', 'SKU123', 30);

      expect(result.qty).toBe(70);
      expect(result.version).toBe(2);
      expect(inventoryRepository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          qty: 70,
          version: 2,
        })
      );
      expect(eventLogRepository.append).toHaveBeenCalled();
    });

    it('should throw InsufficientStockError when not enough stock', async () => {
      const { inventoryRepository } = await import('../../src/repositories/inventory.repo');
      const { perKeyMutex } = await import('../../src/utils/perKeyMutex');
      const { idempotencyStore } = await import('../../src/utils/idempotency');

      vi.mocked(idempotencyStore.get).mockResolvedValue(null);
      vi.mocked(inventoryRepository.get).mockResolvedValue(mockInventoryRecord);
      vi.mocked(perKeyMutex.acquire).mockImplementation(async (key, fn) => fn());

      await expect(
        inventoryService.reserveStock('STORE001', 'SKU123', 150)
      ).rejects.toThrow(InsufficientStockError);
    });

    it('should throw ConflictError on version mismatch', async () => {
      const { inventoryRepository } = await import('../../src/repositories/inventory.repo');
      const { perKeyMutex } = await import('../../src/utils/perKeyMutex');
      const { idempotencyStore } = await import('../../src/utils/idempotency');

      vi.mocked(idempotencyStore.get).mockResolvedValue(null);
      vi.mocked(inventoryRepository.get).mockResolvedValue(mockInventoryRecord);
      vi.mocked(perKeyMutex.acquire).mockImplementation(async (key, fn) => fn());

      await expect(
        inventoryService.reserveStock('STORE001', 'SKU123', 30, 5)
      ).rejects.toThrow(ConflictError);
    });
  });
});
