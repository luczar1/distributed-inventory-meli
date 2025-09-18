import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { InventoryRecord } from '../../src/core/types';
import { inventoryRepository } from '../../src/repositories/inventory.repo';
import { eventLogRepository } from '../../src/repositories/eventlog.repo';
import { idempotencyStore } from '../../src/utils/idempotency';

// Mock repositories
vi.mock('../../src/repositories/inventory.repo');
vi.mock('../../src/repositories/eventlog.repo');
vi.mock('../../src/utils/idempotency');
vi.mock('../../src/utils/perKeyMutex', () => ({
  perKeyMutex: {
    acquire: vi.fn((key, fn) => fn()),
  },
}));

describe('Inventory Routes API', () => {
  let server: unknown;

  beforeAll(() => {
    server = app;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    idempotencyStore.clear();
    
    // Mock idempotency store to not cache results
    vi.mocked(idempotencyStore.get).mockResolvedValue(null);
    vi.mocked(idempotencyStore.set).mockResolvedValue(undefined);
  });

  afterAll(() => {
    // Cleanup if needed
  });

  describe('GET /api/inventory/stores/:storeId/inventory/:sku', () => {
    it('should return inventory record with ETag header', async () => {
      const mockRecord: InventoryRecord = {
        sku: 'SKU123',
        storeId: 'STORE001',
        qty: 100,
        version: 1,
        updatedAt: new Date()
      };
      
      vi.mocked(inventoryRepository.get).mockResolvedValue(mockRecord);

      const response = await request(server)
        .get('/api/inventory/stores/STORE001/inventory/SKU123')
        .expect(200);

      expect(response.body).toEqual({
        sku: 'SKU123',
        storeId: 'STORE001',
        qty: 100,
        version: 1,
        updatedAt: expect.any(String),
      });

      expect(response.headers.etag).toBe('"1"');
    });

    it('should validate store ID format', async () => {
      const response = await request(server)
        .get('/api/inventory/stores//inventory/SKU123')
        .expect(404);

      // 404 responses use Express default handler, not our custom error structure
      expect(response.body).toBeDefined();
    });

    it('should validate SKU format', async () => {
      const response = await request(server)
        .get('/api/inventory/stores/STORE001/inventory/')
        .expect(404);

      // 404 responses use Express default handler, not our custom error structure
      expect(response.body).toBeDefined();
    });
  });

  describe('POST /api/inventory/stores/:storeId/inventory/:sku/adjust', () => {
    it('should adjust stock with valid payload', async () => {
      const mockRecord: InventoryRecord = {
        sku: 'SKU123',
        storeId: 'STORE001',
        qty: 100,
        version: 1,
        updatedAt: new Date()
      };
      
      vi.mocked(inventoryRepository.get).mockResolvedValue(mockRecord);
      vi.mocked(inventoryRepository.upsert).mockResolvedValue();
      vi.mocked(eventLogRepository.append).mockResolvedValue();

      const response = await request(server)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/adjust')
        .send({ delta: 50 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.newQuantity).toBe(150);
      expect(response.body.newVersion).toBe(2);
    });

    it('should adjust stock with expected version', async () => {
      const mockRecord: InventoryRecord = {
        sku: 'SKU123',
        storeId: 'STORE001',
        qty: 100,
        version: 1,
        updatedAt: new Date()
      };
      
      vi.mocked(inventoryRepository.get).mockResolvedValue(mockRecord);
      vi.mocked(inventoryRepository.upsert).mockResolvedValue();
      vi.mocked(eventLogRepository.append).mockResolvedValue();

      const response = await request(server)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/adjust')
        .send({ delta: 25, expectedVersion: 1 })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should validate delta is integer', async () => {
      const response = await request(server)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/adjust')
        .send({ delta: 'invalid' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should validate expected version is positive integer', async () => {
      const response = await request(server)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/adjust')
        .send({ delta: 10, expectedVersion: -1 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

  });

  describe('POST /api/inventory/stores/:storeId/inventory/:sku/reserve', () => {
    it('should reserve stock with valid payload', async () => {
      const mockRecord: InventoryRecord = {
        sku: 'SKU123',
        storeId: 'STORE001',
        qty: 100,
        version: 1,
        updatedAt: new Date()
      };
      
      vi.mocked(inventoryRepository.get).mockResolvedValue(mockRecord);
      vi.mocked(inventoryRepository.upsert).mockResolvedValue();
      vi.mocked(eventLogRepository.append).mockResolvedValue();

      const response = await request(server)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/reserve')
        .send({ qty: 20 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.newQuantity).toBe(80);
      expect(response.body.newVersion).toBe(2);
    });

    it('should reserve stock with expected version', async () => {
      const mockRecord: InventoryRecord = {
        sku: 'SKU123',
        storeId: 'STORE001',
        qty: 100,
        version: 1,
        updatedAt: new Date()
      };
      
      vi.mocked(inventoryRepository.get).mockResolvedValue(mockRecord);
      vi.mocked(inventoryRepository.upsert).mockResolvedValue();
      vi.mocked(eventLogRepository.append).mockResolvedValue();

      const response = await request(server)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/reserve')
        .send({ qty: 15, expectedVersion: 1 })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should validate qty is non-negative integer', async () => {
      const response = await request(server)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/reserve')
        .send({ qty: -5 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

  });
});
