import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';

// Mock the sync worker
vi.mock('../../src/workers/sync.worker', () => ({
  SyncWorker: vi.fn().mockImplementation(() => ({
    syncOnce: vi.fn(),
    getStatus: vi.fn(),
    startSync: vi.fn(),
    stopSync: vi.fn(),
  })),
}));

describe('Sync Routes API', () => {
  let server: unknown;
  let mockSyncWorker: unknown;

  beforeAll(async () => {
    server = app;
    const { SyncWorker } = await import('../../src/workers/sync.worker');
    mockSyncWorker = new SyncWorker();
  });

  afterAll(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/sync', () => {
    it('should trigger manual sync', async () => {
      mockSyncWorker.syncOnce.mockResolvedValue(undefined);

      const response = await request(server)
        .post('/api/sync')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Sync completed successfully'
      });

      expect(mockSyncWorker.syncOnce).toHaveBeenCalledTimes(1);
    });

    it('should handle sync errors', async () => {
      mockSyncWorker.syncOnce.mockRejectedValue(new Error('Sync failed'));

      const response = await request(server)
        .post('/api/sync')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Internal server error');
    });
  });

  describe('GET /api/sync/status', () => {
    it('should return sync worker status', async () => {
      const mockStatus = {
        isRunning: false,
        lastProcessedEventId: 'event-123'
      };
      mockSyncWorker.getStatus.mockReturnValue(mockStatus);

      const response = await request(server)
        .get('/api/sync/status')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: mockStatus
      });

      expect(mockSyncWorker.getStatus).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /api/sync/start', () => {
    it('should start sync worker with default interval', async () => {
      mockSyncWorker.startSync.mockImplementation(() => {});

      const response = await request(server)
        .post('/api/sync/start')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Sync worker started with interval 15000ms'
      });

      expect(mockSyncWorker.startSync).toHaveBeenCalledWith(15000);
    });

    it('should start sync worker with custom interval', async () => {
      mockSyncWorker.startSync.mockImplementation(() => {});

      const response = await request(server)
        .post('/api/sync/start')
        .send({ intervalMs: 5000 })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Sync worker started with interval 5000ms'
      });

      expect(mockSyncWorker.startSync).toHaveBeenCalledWith(5000);
    });
  });

  describe('POST /api/sync/stop', () => {
    it('should stop sync worker', async () => {
      mockSyncWorker.stopSync.mockImplementation(() => {});

      const response = await request(server)
        .post('/api/sync/stop')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Sync worker stopped'
      });

      expect(mockSyncWorker.stopSync).toHaveBeenCalledTimes(1);
    });
  });
});
