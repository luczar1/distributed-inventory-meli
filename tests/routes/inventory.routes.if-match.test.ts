import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { inventoryRepository } from '../../src/repositories/inventory.repo';
import { inventoryService } from '../../src/services/inventory.service';
import { eventLogRepository } from '../../src/repositories/eventlog.repo';
import { idempotencyStore } from '../../src/utils/idempotency';
import { ConflictError } from '../../src/core/errors';

// Mock dependencies
vi.mock('../../src/repositories/inventory.repo');
vi.mock('../../src/services/inventory.service');
vi.mock('../../src/repositories/eventlog.repo');
vi.mock('../../src/utils/idempotency');
vi.mock('../../src/utils/perKeyMutex', () => ({
  perKeyMutex: {
    acquire: vi.fn((key, fn) => fn()),
  },
}));
vi.mock('../../src/utils/circuitBreaker', () => ({
  apiBreaker: {
    execute: vi.fn((fn) => fn()),
  },
}));
vi.mock('../../src/utils/bulkhead', () => ({
  apiBulkhead: {
    run: vi.fn((fn) => fn()),
  },
}));
vi.mock('../../src/utils/metrics', () => ({
  incrementAdjustStock: vi.fn(),
  incrementReserveStock: vi.fn(),
  incrementIdempotentHits: vi.fn(),
  incrementConflicts: vi.fn(),
  incrementLockAcquired: vi.fn(),
  incrementLockContended: vi.fn(),
  incrementRequests: vi.fn(),
  incrementErrors: vi.fn(),
  incrementRateLimited: vi.fn(),
  incrementShed: vi.fn(),
  incrementBreakerOpen: vi.fn(),
  incrementFsRetries: vi.fn(),
  incrementSnapshots: vi.fn(),
  incrementLockStolen: vi.fn(),
  incrementLockExpired: vi.fn(),
  incrementLockLost: vi.fn(),
  incrementLockReleaseFailures: vi.fn(),
}));
vi.mock('../../src/utils/lockFile', () => ({
  acquireLock: vi.fn(),
  releaseLock: vi.fn(),
}));

const mockInventoryRepository = vi.mocked(inventoryRepository);
const mockInventoryService = vi.mocked(inventoryService);
const mockEventLogRepository = vi.mocked(eventLogRepository);
const mockIdempotencyStore = vi.mocked(idempotencyStore);

describe('Inventory Routes - If-Match Header Support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock idempotency store to not cache results
    mockIdempotencyStore.get.mockResolvedValue(null);
    mockIdempotencyStore.set.mockResolvedValue(undefined);
    
    // Mock event log repository
    mockEventLogRepository.append.mockResolvedValue();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/inventory/stores/:storeId/inventory/:sku/adjust', () => {
    it('should use If-Match header version when provided', async () => {
      const storeId = 'store1';
      const sku = 'SKU123';
      const currentRecord = {
        sku,
        storeId,
        qty: 100,
        version: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const adjustedResult = { qty: 120, version: 6 };

      mockInventoryRepository.get.mockResolvedValue(currentRecord);
      mockInventoryService.adjustStock.mockResolvedValue(adjustedResult);

      const response = await request(app)
        .post(`/api/inventory/stores/${storeId}/inventory/${sku}/adjust`)
        .set('If-Match', '"5"')
        .send({ delta: 20 });

      console.log('Response status:', response.status);
      console.log('Response body:', JSON.stringify(response.body, null, 2));
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.newQuantity).toBe(120);
      expect(response.body.newVersion).toBe(6);
      expect(response.headers.etag).toBe('"6"');

      // Verify service was called with If-Match version
      expect(mockInventoryService.adjustStock).toHaveBeenCalledWith(
        storeId,
        sku,
        20,
        5, // If-Match version
        undefined // idempotency key
      );
    });

    it('should use body expectedVersion when If-Match header is not provided', async () => {
      const storeId = 'store1';
      const sku = 'SKU123';
      const currentRecord = {
        sku,
        storeId,
        qty: 100,
        version: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const adjustedResult = { qty: 80, version: 4 };

      mockInventoryRepository.get.mockResolvedValue(currentRecord);
      mockInventoryService.adjustStock.mockResolvedValue(adjustedResult);

      const response = await request(app)
        .post(`/api/inventory/stores/${storeId}/inventory/${sku}/adjust`)
        .send({ delta: -20, expectedVersion: 3 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.newQuantity).toBe(80);
      expect(response.body.newVersion).toBe(4);

      // Verify service was called with body expectedVersion
      expect(mockInventoryService.adjustStock).toHaveBeenCalledWith(
        storeId,
        sku,
        -20,
        3, // body expectedVersion
        undefined // idempotency key
      );
    });

    it('should prioritize If-Match header over body expectedVersion', async () => {
      const storeId = 'store1';
      const sku = 'SKU123';
      const currentRecord = {
        sku,
        storeId,
        qty: 100,
        version: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const adjustedResult = { qty: 120, version: 6 };

      mockInventoryRepository.get.mockResolvedValue(currentRecord);
      mockInventoryService.adjustStock.mockResolvedValue(adjustedResult);

      const response = await request(app)
        .post(`/api/inventory/stores/${storeId}/inventory/${sku}/adjust`)
        .set('If-Match', '"5"')
        .send({ delta: 20, expectedVersion: 3 }) // This should be ignored
        .expect(200);

      // Verify service was called with If-Match version, not body version
      expect(mockInventoryService.adjustStock).toHaveBeenCalledWith(
        storeId,
        sku,
        20,
        5, // If-Match version (not 3 from body)
        undefined // idempotency key
      );
    });

    it('should return 409 when If-Match version does not match current version', async () => {
      const storeId = 'store1';
      const sku = 'SKU123';
      const currentRecord = {
        sku,
        storeId,
        qty: 100,
        version: 5, // Current version
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockInventoryRepository.get.mockResolvedValue(currentRecord);

      const response = await request(app)
        .post(`/api/inventory/stores/${storeId}/inventory/${sku}/adjust`)
        .set('If-Match', '"3"') // Mismatched version
        .send({ delta: 20 })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error.name).toBe('ConflictError');
      expect(response.body.error.message).toContain('Version mismatch');
    });

    it('should return 409 when body expectedVersion does not match current version', async () => {
      const storeId = 'store1';
      const sku = 'SKU123';
      const currentRecord = {
        sku,
        storeId,
        qty: 100,
        version: 5, // Current version
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockInventoryRepository.get.mockResolvedValue(currentRecord);

      const response = await request(app)
        .post(`/api/inventory/stores/${storeId}/inventory/${sku}/adjust`)
        .send({ delta: 20, expectedVersion: 3 }) // Mismatched version
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error.name).toBe('ConflictError');
      expect(response.body.error.message).toContain('Version mismatch');
    });
  });

  describe('POST /api/inventory/stores/:storeId/inventory/:sku/reserve', () => {
    it('should use If-Match header version when provided', async () => {
      const storeId = 'store1';
      const sku = 'SKU123';
      const currentRecord = {
        sku,
        storeId,
        qty: 100,
        version: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const reservedResult = { qty: 80, version: 6 };

      mockInventoryRepository.get.mockResolvedValue(currentRecord);
      mockInventoryService.reserveStock.mockResolvedValue(reservedResult);

      const response = await request(app)
        .post(`/api/inventory/stores/${storeId}/inventory/${sku}/reserve`)
        .set('If-Match', '"5"')
        .send({ qty: 20 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.newQuantity).toBe(80);
      expect(response.body.newVersion).toBe(6);
      expect(response.headers.etag).toBe('"6"');

      // Verify service was called with If-Match version
      expect(mockInventoryService.reserveStock).toHaveBeenCalledWith(
        storeId,
        sku,
        20,
        5, // If-Match version
        undefined // idempotency key
      );
    });

    it('should use body expectedVersion when If-Match header is not provided', async () => {
      const storeId = 'store1';
      const sku = 'SKU123';
      const currentRecord = {
        sku,
        storeId,
        qty: 100,
        version: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const reservedResult = { qty: 80, version: 4 };

      mockInventoryRepository.get.mockResolvedValue(currentRecord);
      mockInventoryService.reserveStock.mockResolvedValue(reservedResult);

      const response = await request(app)
        .post(`/api/inventory/stores/${storeId}/inventory/${sku}/reserve`)
        .send({ qty: 20, expectedVersion: 3 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.newQuantity).toBe(80);
      expect(response.body.newVersion).toBe(4);

      // Verify service was called with body expectedVersion
      expect(mockInventoryService.reserveStock).toHaveBeenCalledWith(
        storeId,
        sku,
        20,
        3, // body expectedVersion
        undefined // idempotency key
      );
    });

    it('should prioritize If-Match header over body expectedVersion', async () => {
      const storeId = 'store1';
      const sku = 'SKU123';
      const currentRecord = {
        sku,
        storeId,
        qty: 100,
        version: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const reservedResult = { qty: 80, version: 6 };

      mockInventoryRepository.get.mockResolvedValue(currentRecord);
      mockInventoryService.reserveStock.mockResolvedValue(reservedResult);

      const response = await request(app)
        .post(`/api/inventory/stores/${storeId}/inventory/${sku}/reserve`)
        .set('If-Match', '"5"')
        .send({ qty: 20, expectedVersion: 3 }) // This should be ignored
        .expect(200);

      // Verify service was called with If-Match version, not body version
      expect(mockInventoryService.reserveStock).toHaveBeenCalledWith(
        storeId,
        sku,
        20,
        5, // If-Match version (not 3 from body)
        undefined // idempotency key
      );
    });

    it('should return 409 when If-Match version does not match current version', async () => {
      const storeId = 'store1';
      const sku = 'SKU123';
      const currentRecord = {
        sku,
        storeId,
        qty: 100,
        version: 5, // Current version
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockInventoryRepository.get.mockResolvedValue(currentRecord);

      const response = await request(app)
        .post(`/api/inventory/stores/${storeId}/inventory/${sku}/reserve`)
        .set('If-Match', '"3"') // Mismatched version
        .send({ qty: 20 })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error.name).toBe('ConflictError');
      expect(response.body.error.message).toContain('Version mismatch');
    });

    it('should return 409 when body expectedVersion does not match current version', async () => {
      const storeId = 'store1';
      const sku = 'SKU123';
      const currentRecord = {
        sku,
        storeId,
        qty: 100,
        version: 5, // Current version
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockInventoryRepository.get.mockResolvedValue(currentRecord);

      const response = await request(app)
        .post(`/api/inventory/stores/${storeId}/inventory/${sku}/reserve`)
        .send({ qty: 20, expectedVersion: 3 }) // Mismatched version
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error.name).toBe('ConflictError');
      expect(response.body.error.message).toContain('Version mismatch');
    });
  });
});
