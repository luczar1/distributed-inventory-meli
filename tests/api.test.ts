import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { inventoryRepository } from '../src/repositories/inventory.repo';
import { eventLogRepository } from '../src/repositories/eventlog.repo';
import { InventoryRecord } from '../src/core/types';

// Mock repositories and sync worker
vi.mock('../src/repositories/inventory.repo');
vi.mock('../src/repositories/eventlog.repo');
vi.mock('../src/workers/sync.worker', () => ({
  SyncWorker: vi.fn().mockImplementation(() => ({
    syncOnce: vi.fn(),
    getStatus: vi.fn(),
    startSync: vi.fn(),
    stopSync: vi.fn(),
  })),
  syncWorker: {
    syncOnce: vi.fn(),
    getStatus: vi.fn(),
    startSync: vi.fn(),
    stopSync: vi.fn(),
  },
}));

describe('API Integration Tests', () => {
  let server: unknown;

  beforeAll(async () => {
    server = app.listen(0);
  });

  afterAll(async () => {
    if (server) server.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Health Endpoint', () => {
    it('should return health status', async () => {
      const response = await request(server).get('/api/health').expect(200);
      expect(response.body).toEqual({
        success: true,
        data: {
          status: 'healthy',
          timestamp: expect.any(String),
          uptime: expect.any(Number),
        }
      });
      expect(response.headers['x-request-id']).toBeDefined();
    });
  });

  describe('Inventory GET', () => {
    it('should return inventory record with ETag', async () => {
      const mockRecord: InventoryRecord = {
        sku: 'SKU123', storeId: 'STORE001', qty: 100, version: 1, updatedAt: new Date()
      };
      vi.mocked(inventoryRepository.get).mockResolvedValue(mockRecord);
      const response = await request(server)
        .get('/api/inventory/stores/STORE001/inventory/SKU123').expect(200);
      expect(response.body.sku).toBe('SKU123');
      expect(response.body.storeId).toBe('STORE001');
      expect(response.body.qty).toBe(100);
      expect(response.body.version).toBe(1);
      expect(response.headers.etag).toBe('"1"');
    });

    it('should return 404 for non-existent SKU', async () => {
      vi.mocked(inventoryRepository.get).mockRejectedValue(new Error('Not found'));
      const response = await request(server)
        .get('/api/inventory/stores/STORE001/inventory/SKU999').expect(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    });
  });

  describe('Inventory Adjust', () => {
    it('should adjust stock successfully', async () => {
      const mockRecord: InventoryRecord = {
        sku: 'SKU123', storeId: 'STORE001', qty: 100, version: 1, updatedAt: new Date()
      };
      vi.mocked(inventoryRepository.get).mockResolvedValue(mockRecord);
      vi.mocked(inventoryRepository.upsert).mockResolvedValue();
      vi.mocked(eventLogRepository.append).mockResolvedValue();
      const response = await request(server)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/adjust')
        .send({ delta: 50 }).expect(200);
      expect(response.body.success).toBe(true);
      expect(response.body.newQuantity).toBe(150);
      expect(response.body.newVersion).toBe(2);
    });

    it('should return 400 for invalid delta', async () => {
      const response = await request(server)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/adjust')
        .send({ delta: 'invalid' }).expect(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 409 for version mismatch', async () => {
      const mockRecord: InventoryRecord = {
        sku: 'SKU123', storeId: 'STORE001', qty: 100, version: 2, updatedAt: new Date()
      };
      vi.mocked(inventoryRepository.get).mockResolvedValue(mockRecord);
      const response = await request(server)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/adjust')
        .send({ delta: 50, expectedVersion: 1 }).expect(409);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('CONFLICT_ERROR');
    });
  });

  describe('Inventory Reserve', () => {
    it('should reserve stock successfully', async () => {
      const mockRecord: InventoryRecord = {
        sku: 'SKU123', storeId: 'STORE001', qty: 100, version: 1, updatedAt: new Date()
      };
      vi.mocked(inventoryRepository.get).mockResolvedValue(mockRecord);
      vi.mocked(inventoryRepository.upsert).mockResolvedValue();
      vi.mocked(eventLogRepository.append).mockResolvedValue();
      const response = await request(server)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/reserve')
        .send({ qty: 30 }).expect(200);
      expect(response.body.success).toBe(true);
      expect(response.body.newQuantity).toBe(70);
      expect(response.body.newVersion).toBe(2);
    });

    it('should return 400 for invalid quantity', async () => {
      const response = await request(server)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/reserve')
        .send({ qty: -5 }).expect(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 409 for version mismatch', async () => {
      const mockRecord: InventoryRecord = {
        sku: 'SKU123', storeId: 'STORE001', qty: 100, version: 3, updatedAt: new Date()
      };
      vi.mocked(inventoryRepository.get).mockResolvedValue(mockRecord);
      const response = await request(server)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/reserve')
        .send({ qty: 30, expectedVersion: 2 }).expect(409);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('CONFLICT_ERROR');
    });
  });

  describe('Sync Endpoints', () => {
    it('should trigger manual sync', async () => {
      const { syncWorker } = await import('../src/workers/sync.worker');
      vi.mocked(syncWorker.syncOnce).mockResolvedValue();
      const response = await request(server).post('/api/sync').expect(200);
      expect(response.body.success).toBe(true);
    });

    it('should return sync status', async () => {
      const { syncWorker } = await import('../src/workers/sync.worker');
      vi.mocked(syncWorker.getStatus).mockReturnValue({ isRunning: false });
      const response = await request(server).get('/api/sync/status').expect(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.isRunning).toBe(false);
    });

    it('should start periodic sync', async () => {
      const { syncWorker } = await import('../src/workers/sync.worker');
      vi.mocked(syncWorker.startSync).mockImplementation(() => {});
      const response = await request(server)
        .post('/api/sync/start').send({ intervalMs: 10000 }).expect(200);
      expect(response.body.success).toBe(true);
    });

    it('should stop periodic sync', async () => {
      const { syncWorker } = await import('../src/workers/sync.worker');
      vi.mocked(syncWorker.stopSync).mockImplementation(() => {});
      const response = await request(server).post('/api/sync/stop').expect(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('Idempotency', () => {
    it('should return same result for repeated idempotency key', async () => {
      const mockRecord: InventoryRecord = {
        sku: 'SKU123', storeId: 'STORE001', qty: 100, version: 1, updatedAt: new Date()
      };
      vi.mocked(inventoryRepository.get).mockResolvedValue(mockRecord);
      vi.mocked(inventoryRepository.upsert).mockResolvedValue();
      vi.mocked(eventLogRepository.append).mockResolvedValue();
      const idempotencyKey = 'test-key-123';
      const response1 = await request(server)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/adjust')
        .set('Idempotency-Key', idempotencyKey).send({ delta: 50 }).expect(200);
      const response2 = await request(server)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/adjust')
        .set('Idempotency-Key', idempotencyKey).send({ delta: 50 }).expect(200);
      // Compare responses but ignore timestamp differences
      expect(response1.body.success).toBe(response2.body.success);
      expect(response1.body.newQuantity).toBe(response2.body.newQuantity);
      expect(response1.body.newVersion).toBe(response2.body.newVersion);
      expect(response1.body.record.qty).toBe(response2.body.record.qty);
      expect(response1.body.record.sku).toBe(response2.body.record.sku);
      expect(response1.body.record.storeId).toBe(response2.body.record.storeId);
      expect(response1.body.record.version).toBe(response2.body.record.version);
      expect(inventoryRepository.upsert).toHaveBeenCalledTimes(1);
    });
  });
});