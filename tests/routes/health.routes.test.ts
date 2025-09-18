import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';

// Mock dependencies
vi.mock('../../src/utils/metrics', () => ({
  metrics: {
    getMetrics: vi.fn(),
  },
  incrementRequests: vi.fn(),
  incrementErrors: vi.fn(),
  incrementConflicts: vi.fn(),
  incrementIdempotentHits: vi.fn(),
  incrementAdjustStock: vi.fn(),
  incrementReserveStock: vi.fn(),
  incrementGetInventory: vi.fn(),
  incrementSyncOperations: vi.fn(),
  incrementRateLimitHits: vi.fn(),
  incrementLoadSheddingRejections: vi.fn(),
  incrementFileSystemRetries: vi.fn(),
  incrementSnapshotsCreated: vi.fn(),
}));

vi.mock('../../src/utils/circuitBreaker', () => ({
  getCircuitBreakerMetrics: vi.fn(),
}));

vi.mock('../../src/utils/bulkhead', () => ({
  getBulkheadMetrics: vi.fn(),
}));

vi.mock('../../src/middleware/loadShedding', () => ({
  loadSheddingMiddleware: vi.fn((req, res, next) => next()),
  getLoadSheddingStats: vi.fn(),
}));

vi.mock('../../src/middleware/rateLimiter', () => ({
  rateLimitMiddleware: vi.fn((req, res, next) => next()),
  getRateLimiterStats: vi.fn(),
}));

import { metrics } from '../../src/utils/metrics';
import { getCircuitBreakerMetrics } from '../../src/utils/circuitBreaker';
import { getBulkheadMetrics } from '../../src/utils/bulkhead';
import { getLoadSheddingStats } from '../../src/middleware/loadShedding';
import { getRateLimiterStats } from '../../src/middleware/rateLimiter';

const mockMetrics = vi.mocked(metrics);
const mockGetCircuitBreakerMetrics = vi.mocked(getCircuitBreakerMetrics);
const mockGetBulkheadMetrics = vi.mocked(getBulkheadMetrics);
const mockGetLoadSheddingStats = vi.mocked(getLoadSheddingStats);
const mockGetRateLimiterStats = vi.mocked(getRateLimiterStats);

describe('Health Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/health', () => {
    it('should return basic health status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('healthy');
      expect(response.body.data.timestamp).toBeDefined();
      expect(response.body.data.uptime).toBeDefined();
    });
  });

  describe('GET /api/health/liveness', () => {
    it('should return liveness status', async () => {
      const response = await request(app)
        .get('/api/health/liveness')
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.uptime).toBeDefined();
    });
  });

  describe('GET /api/health/readiness', () => {
    it('should return ready status when all systems are healthy', async () => {
      mockGetCircuitBreakerMetrics.mockReturnValue({
        apiBreaker: { state: 'closed', failures: 0, successes: 10 },
        syncBreaker: { state: 'closed', failures: 0, successes: 5 },
        fileSystemBreaker: { state: 'closed', failures: 0, successes: 20 },
      });

      mockGetBulkheadMetrics.mockReturnValue({
        apiBulkhead: { queued: 5, queueSize: 100, active: 2 },
        syncBulkhead: { queued: 0, queueSize: 50, active: 1 },
        fileSystemBulkhead: { queued: 1, queueSize: 20, active: 3 },
      });

      mockGetLoadSheddingStats.mockReturnValue({
        currentQueueDepth: 50,
        maxQueueDepth: 1000,
        rejectedRequests: 0,
      });

      const response = await request(app)
        .get('/api/health/readiness')
        .expect(200);

      expect(response.body.ready).toBe(true);
      expect(response.body.criticalBreakersOpen).toBe(false);
      expect(response.body.queueOverThreshold).toBe(false);
      expect(response.body.loadSheddingActive).toBe(false);
      expect(response.body.breakers).toBeDefined();
      expect(response.body.queueDepth).toBeDefined();
      expect(response.body.loadShedding).toBeDefined();
    });

    it('should return not ready when circuit breakers are open', async () => {
      mockGetCircuitBreakerMetrics.mockReturnValue({
        apiBreaker: { state: 'open', failures: 5, successes: 0 },
        syncBreaker: { state: 'closed', failures: 0, successes: 5 },
        fileSystemBreaker: { state: 'closed', failures: 0, successes: 20 },
      });

      mockGetBulkheadMetrics.mockReturnValue({
        apiBulkhead: { queued: 5, queueSize: 100, active: 2 },
        syncBulkhead: { queued: 0, queueSize: 50, active: 1 },
        fileSystemBulkhead: { queued: 1, queueSize: 20, active: 3 },
      });

      mockGetLoadSheddingStats.mockReturnValue({
        currentQueueDepth: 50,
        maxQueueDepth: 1000,
        rejectedRequests: 0,
      });

      const response = await request(app)
        .get('/api/health/readiness')
        .expect(503);

      expect(response.body.ready).toBe(false);
      expect(response.body.criticalBreakersOpen).toBe(true);
    });

    it('should return not ready when queues are over threshold', async () => {
      mockGetCircuitBreakerMetrics.mockReturnValue({
        apiBreaker: { state: 'closed', failures: 0, successes: 10 },
        syncBreaker: { state: 'closed', failures: 0, successes: 5 },
        fileSystemBreaker: { state: 'closed', failures: 0, successes: 20 },
      });

      mockGetBulkheadMetrics.mockReturnValue({
        apiBulkhead: { queued: 85, queueSize: 100, active: 2 }, // 85% > 80% threshold
        syncBulkhead: { queued: 0, queueSize: 50, active: 1 },
        fileSystemBulkhead: { queued: 1, queueSize: 20, active: 3 },
      });

      mockGetLoadSheddingStats.mockReturnValue({
        currentQueueDepth: 50,
        maxQueueDepth: 1000,
        rejectedRequests: 0,
      });

      const response = await request(app)
        .get('/api/health/readiness')
        .expect(503);

      expect(response.body.ready).toBe(false);
      expect(response.body.queueOverThreshold).toBe(true);
    });

    it('should return not ready when load shedding is active', async () => {
      mockGetCircuitBreakerMetrics.mockReturnValue({
        apiBreaker: { state: 'closed', failures: 0, successes: 10 },
        syncBreaker: { state: 'closed', failures: 0, successes: 5 },
        fileSystemBreaker: { state: 'closed', failures: 0, successes: 20 },
      });

      mockGetBulkheadMetrics.mockReturnValue({
        apiBulkhead: { queued: 5, queueSize: 100, active: 2 },
        syncBulkhead: { queued: 0, queueSize: 50, active: 1 },
        fileSystemBulkhead: { queued: 1, queueSize: 20, active: 3 },
      });

      mockGetLoadSheddingStats.mockReturnValue({
        currentQueueDepth: 950, // 95% > 90% threshold
        maxQueueDepth: 1000,
        rejectedRequests: 10,
      });

      const response = await request(app)
        .get('/api/health/readiness')
        .expect(503);

      expect(response.body.ready).toBe(false);
      expect(response.body.loadSheddingActive).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      mockGetCircuitBreakerMetrics.mockImplementation(() => {
        throw new Error('Circuit breaker metrics failed');
      });

      const response = await request(app)
        .get('/api/health/readiness')
        .expect(503);

      expect(response.body.ready).toBe(false);
      expect(response.body.error).toBe('Readiness check failed');
    });
  });

  describe('GET /api/health/metrics', () => {
    it('should return comprehensive metrics', async () => {
      mockMetrics.getMetrics.mockReturnValue({
        requests: 100,
        errors: 5,
        conflicts: 2,
        idempotentHits: 10,
        adjustStock: 50,
        reserveStock: 30,
        getInventory: 20,
        syncOperations: 5,
        rateLimitHits: 3,
        loadSheddingRejections: 1,
        fileSystemRetries: 2,
        snapshotsCreated: 1,
      });

      mockGetCircuitBreakerMetrics.mockReturnValue({
        apiBreaker: { state: 'closed', failures: 0, successes: 10 },
        syncBreaker: { state: 'closed', failures: 0, successes: 5 },
        fileSystemBreaker: { state: 'closed', failures: 0, successes: 20 },
      });

      mockGetBulkheadMetrics.mockReturnValue({
        apiBulkhead: { queued: 5, queueSize: 100, active: 2 },
        syncBulkhead: { queued: 0, queueSize: 50, active: 1 },
        fileSystemBulkhead: { queued: 1, queueSize: 20, active: 3 },
      });

      mockGetLoadSheddingStats.mockReturnValue({
        currentQueueDepth: 50,
        maxQueueDepth: 1000,
        rejectedRequests: 0,
      });

      mockGetRateLimiterStats.mockReturnValue({
        activeBuckets: 5,
        rateLimitRPS: 100,
        rateLimitBurst: 200,
      });

      const response = await request(app)
        .get('/api/health/metrics')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.requests).toBe(100);
      expect(response.body.data.errors).toBe(5);
      expect(response.body.data.conflicts).toBe(2);
      expect(response.body.data.idempotentHits).toBe(10);
      expect(response.body.data.rateLimited).toBe(3);
      expect(response.body.data.shed).toBe(1);
      expect(response.body.data.breakerOpen).toBe(0);
      expect(response.body.data.fsRetries).toBe(2);
      expect(response.body.data.snapshots).toBe(1);
      expect(response.body.data.system).toBeDefined();
      expect(response.body.data.circuitBreakers).toBeDefined();
      expect(response.body.data.bulkheads).toBeDefined();
      expect(response.body.data.loadShedding).toBeDefined();
      expect(response.body.data.rateLimiter).toBeDefined();
    });

    it('should handle metrics errors gracefully', async () => {
      mockMetrics.getMetrics.mockImplementation(() => {
        throw new Error('Metrics failed');
      });

      const response = await request(app)
        .get('/api/health/metrics')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to get metrics');
    });
  });
});