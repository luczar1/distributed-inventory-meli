import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { inventoryService } from '../../src/services/inventory.service';
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

describe('InventoryService - Event Logging', () => {
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

  describe('adjustStock event logging', () => {
    it('should log stock_adjusted event', async () => {
      const { eventLogRepository } = await import('../../src/repositories/eventlog.repo');
      const { inventoryRepository } = await import('../../src/repositories/inventory.repo');
      const { perKeyMutex } = await import('../../src/utils/perKeyMutex');
      const { idempotencyStore } = await import('../../src/utils/idempotency');

      vi.mocked(idempotencyStore.get).mockResolvedValue(null);
      vi.mocked(inventoryRepository.get).mockResolvedValue(mockInventoryRecord);
      vi.mocked(perKeyMutex.acquire).mockImplementation(async (key, fn) => fn());

      await inventoryService.adjustStock('STORE001', 'SKU123', 50);

      expect(eventLogRepository.append).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'stock_adjusted',
          payload: expect.objectContaining({
            sku: 'SKU123',
            storeId: 'STORE001',
            delta: 50,
            previousQty: 100,
            newQty: 150,
            previousVersion: 1,
            newVersion: 2,
          }),
        })
      );
    });

    it('should log negative adjustment event', async () => {
      const { eventLogRepository } = await import('../../src/repositories/eventlog.repo');
      const { inventoryRepository } = await import('../../src/repositories/inventory.repo');
      const { perKeyMutex } = await import('../../src/utils/perKeyMutex');
      const { idempotencyStore } = await import('../../src/utils/idempotency');

      vi.mocked(idempotencyStore.get).mockResolvedValue(null);
      vi.mocked(inventoryRepository.get).mockResolvedValue(mockInventoryRecord);
      vi.mocked(perKeyMutex.acquire).mockImplementation(async (key, fn) => fn());

      await inventoryService.adjustStock('STORE001', 'SKU123', -30);

      expect(eventLogRepository.append).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'stock_adjusted',
          payload: expect.objectContaining({
            delta: -30,
            previousQty: 100,
            newQty: 70,
          }),
        })
      );
    });
  });

  describe('reserveStock event logging', () => {
    it('should log stock_reserved event', async () => {
      const { eventLogRepository } = await import('../../src/repositories/eventlog.repo');
      const { inventoryRepository } = await import('../../src/repositories/inventory.repo');
      const { perKeyMutex } = await import('../../src/utils/perKeyMutex');
      const { idempotencyStore } = await import('../../src/utils/idempotency');

      vi.mocked(idempotencyStore.get).mockResolvedValue(null);
      vi.mocked(inventoryRepository.get).mockResolvedValue(mockInventoryRecord);
      vi.mocked(perKeyMutex.acquire).mockImplementation(async (key, fn) => fn());

      await inventoryService.reserveStock('STORE001', 'SKU123', 30);

      expect(eventLogRepository.append).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'stock_reserved',
          payload: expect.objectContaining({
            sku: 'SKU123',
            storeId: 'STORE001',
            reservedQty: 30,
            previousQty: 100,
            newQty: 70,
            previousVersion: 1,
            newVersion: 2,
          }),
        })
      );
    });
  });

  describe('error handling', () => {
    it('should handle repository errors gracefully', async () => {
      const { inventoryRepository } = await import('../../src/repositories/inventory.repo');
      const { perKeyMutex } = await import('../../src/utils/perKeyMutex');
      const { idempotencyStore } = await import('../../src/utils/idempotency');

      vi.mocked(idempotencyStore.get).mockResolvedValue(null);
      vi.mocked(inventoryRepository.get).mockRejectedValue(new Error('Repository error'));
      vi.mocked(perKeyMutex.acquire).mockImplementation(async (key, fn) => fn());

      await expect(
        inventoryService.adjustStock('STORE001', 'SKU123', 50)
      ).rejects.toThrow('Repository error');
    });

    it('should handle event logging errors', async () => {
      const { eventLogRepository } = await import('../../src/repositories/eventlog.repo');
      const { inventoryRepository } = await import('../../src/repositories/inventory.repo');
      const { perKeyMutex } = await import('../../src/utils/perKeyMutex');
      const { idempotencyStore } = await import('../../src/utils/idempotency');

      vi.mocked(idempotencyStore.get).mockResolvedValue(null);
      vi.mocked(inventoryRepository.get).mockResolvedValue(mockInventoryRecord);
      vi.mocked(perKeyMutex.acquire).mockImplementation(async (key, fn) => fn());
      vi.mocked(eventLogRepository.append).mockRejectedValue(new Error('Event log error'));

      await expect(
        inventoryService.adjustStock('STORE001', 'SKU123', 50)
      ).rejects.toThrow('Event log error');
    });
  });
});
