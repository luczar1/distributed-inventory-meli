import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';

// Mock the sync worker
vi.mock('../src/workers/sync.worker', () => ({
  syncWorker: {
    startSync: vi.fn(),
    stopSync: vi.fn(),
    syncOnce: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockReturnValue({ isRunning: false }),
    resetState: vi.fn(),
  },
}));

describe('Bootstrap Integration', () => {
  let server: any;
  let mockSyncWorker: any;

  beforeAll(async () => {
    server = app;
    const { syncWorker } = await import('../src/workers/sync.worker');
    mockSyncWorker = syncWorker;
  });

  afterAll(() => {
    // Cleanup
    if (mockSyncWorker) {
      mockSyncWorker.resetState();
    }
  });

  describe('Server Bootstrap', () => {
    it('should start server and respond to health check', async () => {
      const response = await request(server)
        .get('/api/health')
        .expect(200);

      expect(response.body).toEqual({ status: 'ok' });
    });

    it('should include request ID in headers', async () => {
      const response = await request(server)
        .get('/api/health')
        .expect(200);

      expect(response.headers['x-request-id']).toBeDefined();
      expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('Sync Worker Integration', () => {
    it('should have sync worker available', () => {
      expect(mockSyncWorker).toBeDefined();
      expect(typeof mockSyncWorker.startSync).toBe('function');
      expect(typeof mockSyncWorker.stopSync).toBe('function');
      expect(typeof mockSyncWorker.syncOnce).toBe('function');
    });

    it('should start and stop sync worker', () => {
      mockSyncWorker.startSync(1000); // 1 second for testing
      expect(mockSyncWorker.startSync).toHaveBeenCalledWith(1000);
      
      mockSyncWorker.stopSync();
      expect(mockSyncWorker.stopSync).toHaveBeenCalled();
    });
  });

  describe('API Endpoints', () => {
    it('should respond to inventory GET endpoint', async () => {
      const response = await request(server)
        .get('/api/inventory/stores/STORE001/inventory/SKU123')
        .expect(200);

      expect(response.body).toHaveProperty('sku', 'SKU123');
      expect(response.body).toHaveProperty('storeId', 'STORE001');
      expect(response.headers.etag).toBeDefined();
    });

    it('should respond to inventory adjust endpoint', async () => {
      const response = await request(server)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/adjust')
        .send({ delta: 10 })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('newQuantity');
      expect(response.body).toHaveProperty('newVersion');
    });

    it('should respond to inventory reserve endpoint', async () => {
      const response = await request(server)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/reserve')
        .send({ qty: 5 })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('newQuantity');
      expect(response.body).toHaveProperty('newVersion');
    });

    it('should respond to sync endpoint', async () => {
      const response = await request(server)
        .post('/api/sync')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Sync completed successfully');
    });

    it('should respond to sync status endpoint', async () => {
      const response = await request(server)
        .get('/api/sync/status')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('isRunning');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid requests gracefully', async () => {
      const response = await request(server)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/adjust')
        .send({ delta: 'invalid' })
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });

    it('should handle missing routes with 404', async () => {
      await request(server)
        .get('/api/nonexistent')
        .expect(404);
    });
  });
});
