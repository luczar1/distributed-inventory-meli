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

describe('InventoryService - Idempotency', () => {
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

  describe('adjustStock idempotency', () => {
    it('should return cached result for same idempotency key', async () => {
      const { idempotencyStore } = await import('../../src/utils/idempotency');
      const { inventoryRepository } = await import('../../src/repositories/inventory.repo');
      const { perKeyMutex } = await import('../../src/utils/perKeyMutex');

      const cachedResult = { qty: 150, version: 2 };
      vi.mocked(idempotencyStore.get).mockResolvedValue(cachedResult);

      const result = await inventoryService.adjustStock('STORE001', 'SKU123', 50, undefined, 'test-key');

      expect(result).toEqual(cachedResult);
      expect(inventoryRepository.get).not.toHaveBeenCalled();
      expect(perKeyMutex.acquire).not.toHaveBeenCalled();
    });

    it('should cache result for future idempotency', async () => {
      const { idempotencyStore } = await import('../../src/utils/idempotency');
      const { inventoryRepository } = await import('../../src/repositories/inventory.repo');
      const { perKeyMutex } = await import('../../src/utils/perKeyMutex');

      vi.mocked(idempotencyStore.get).mockResolvedValue(null);
      vi.mocked(inventoryRepository.get).mockResolvedValue(mockInventoryRecord);
      vi.mocked(perKeyMutex.acquire).mockImplementation(async (key, fn) => fn());

      await inventoryService.adjustStock('STORE001', 'SKU123', 50, undefined, 'test-key');

      expect(idempotencyStore.set).toHaveBeenCalledWith(
        'test-key',
        expect.objectContaining({
          qty: 150,
          version: 2,
        })
      );
    });

    it('should generate idempotency key if not provided', async () => {
      const { idempotencyStore } = await import('../../src/utils/idempotency');
      const { inventoryRepository } = await import('../../src/repositories/inventory.repo');
      const { perKeyMutex } = await import('../../src/utils/perKeyMutex');

      vi.mocked(idempotencyStore.get).mockResolvedValue(null);
      vi.mocked(inventoryRepository.get).mockResolvedValue(mockInventoryRecord);
      vi.mocked(perKeyMutex.acquire).mockImplementation(async (key, fn) => fn());

      await inventoryService.adjustStock('STORE001', 'SKU123', 50);

      expect(idempotencyStore.set).toHaveBeenCalledWith(
        expect.any(String), // Generated UUID
        expect.objectContaining({
          qty: 150,
          version: 2,
        })
      );
    });
  });

  describe('reserveStock idempotency', () => {
    it('should return cached result for same idempotency key', async () => {
      const { idempotencyStore } = await import('../../src/utils/idempotency');
      const { inventoryRepository } = await import('../../src/repositories/inventory.repo');
      const { perKeyMutex } = await import('../../src/utils/perKeyMutex');

      const cachedResult = { qty: 70, version: 2 };
      vi.mocked(idempotencyStore.get).mockResolvedValue(cachedResult);

      const result = await inventoryService.reserveStock('STORE001', 'SKU123', 30, undefined, 'test-key');

      expect(result).toEqual(cachedResult);
      expect(inventoryRepository.get).not.toHaveBeenCalled();
      expect(perKeyMutex.acquire).not.toHaveBeenCalled();
    });

    it('should cache result for future idempotency', async () => {
      const { idempotencyStore } = await import('../../src/utils/idempotency');
      const { inventoryRepository } = await import('../../src/repositories/inventory.repo');
      const { perKeyMutex } = await import('../../src/utils/perKeyMutex');

      vi.mocked(idempotencyStore.get).mockResolvedValue(null);
      vi.mocked(inventoryRepository.get).mockResolvedValue(mockInventoryRecord);
      vi.mocked(perKeyMutex.acquire).mockImplementation(async (key, fn) => fn());

      await inventoryService.reserveStock('STORE001', 'SKU123', 30, undefined, 'test-key');

      expect(idempotencyStore.set).toHaveBeenCalledWith(
        'test-key',
        expect.objectContaining({
          qty: 70,
          version: 2,
        })
      );
    });
  });

  describe('concurrency control', () => {
    it('should use per-key mutex for adjustStock', async () => {
      const { perKeyMutex } = await import('../../src/utils/perKeyMutex');
      const { idempotencyStore } = await import('../../src/utils/idempotency');

      vi.mocked(idempotencyStore.get).mockResolvedValue(null);
      vi.mocked(perKeyMutex.acquire).mockImplementation(async (key, fn) => fn());

      await inventoryService.adjustStock('STORE001', 'SKU123', 50);

      expect(perKeyMutex.acquire).toHaveBeenCalledWith('SKU123', expect.any(Function));
    });

    it('should use per-key mutex for reserveStock', async () => {
      const { perKeyMutex } = await import('../../src/utils/perKeyMutex');
      const { idempotencyStore } = await import('../../src/utils/idempotency');

      vi.mocked(idempotencyStore.get).mockResolvedValue(null);
      vi.mocked(perKeyMutex.acquire).mockImplementation(async (key, fn) => fn());

      await inventoryService.reserveStock('STORE001', 'SKU123', 30);

      expect(perKeyMutex.acquire).toHaveBeenCalledWith('SKU123', expect.any(Function));
    });
  });
});
