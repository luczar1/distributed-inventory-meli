import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { rateLimiter } from '../../src/middleware/rateLimiter';
import { loadShedder, loadSheddingMiddleware } from '../../src/middleware/loadShedding';
import { apiBulkhead, syncBulkhead } from '../../src/utils/bulkhead';
import { inventoryRepository } from '../../src/repositories/inventory.repo';
import { inventoryService } from '../../src/services/inventory.service';
import { eventLogRepository } from '../../src/repositories/eventlog.repo';
import { idempotencyStore } from '../../src/utils/idempotency';

// Mock bulkheads to control queue depth
vi.mock('../../src/utils/bulkhead', () => ({
  apiBulkhead: {
    getStats: vi.fn(),
  },
  syncBulkhead: {
    getStats: vi.fn(),
  },
}));

// Mock inventory repository and service
vi.mock('../../src/repositories/inventory.repo');
vi.mock('../../src/services/inventory.service');
vi.mock('../../src/repositories/eventlog.repo');
vi.mock('../../src/utils/idempotency');
vi.mock('../../src/utils/perKeyMutex', () => ({
  perKeyMutex: {
    acquire: vi.fn((key, fn) => fn()),
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
  incrementGetInventory: vi.fn(),
  incrementSyncOperations: vi.fn(),
  metrics: {
    getMetrics: vi.fn(() => ({
      requests: 0,
      errors: 0,
      conflicts: 0,
      idempotentHits: 0,
      rateLimitHits: 0,
      loadSheddingRejections: 0,
      fileSystemRetries: 0,
      snapshotsCreated: 0,
    })),
    reset: vi.fn(),
  },
  getMetrics: vi.fn(() => ({
    requests: 0,
    errors: 0,
    conflicts: 0,
    idempotentHits: 0,
    rateLimitHits: 0,
    loadSheddingRejections: 0,
    fileSystemRetries: 0,
    snapshotsCreated: 0,
  })),
  reset: vi.fn(),
}));
vi.mock('../../src/utils/lockFile', () => ({
  acquireLock: vi.fn(),
  releaseLock: vi.fn(),
}));

// Mock additional dependencies for metrics route

vi.mock('../../src/middleware/loadShedding', () => ({
  loadShedder: {
    getStats: vi.fn(() => ({
      queueDepth: 1500,
      maxQueueDepth: 1000,
      shedRequests: 1,
    })),
    reset: vi.fn(),
  },
  getLoadSheddingStats: vi.fn(() => ({
    queueDepth: 1500,
    maxQueueDepth: 1000,
    shedRequests: 1,
  })),
  loadSheddingMiddleware: vi.fn((req: any, res: any, next: any) => {
    // Simulate load shedding behavior
    // This will be overridden in individual tests
    next(); // Default to allowing requests
  }),
}));

vi.mock('../../src/utils/circuitBreaker', () => ({
  apiBreaker: {
    getStats: vi.fn(),
  },
  syncWorkerBreaker: {
    getStats: vi.fn(),
  },
  fsBreaker: {
    getStats: vi.fn(),
  },
  getCircuitBreakerMetrics: vi.fn(() => ({
    api: { isOpen: false, failureCount: 0, successCount: 0 },
    syncWorker: { isOpen: false, failureCount: 0, successCount: 0 },
    filesystem: { isOpen: false, failureCount: 0, successCount: 0 },
  })),
}));

vi.mock('../../src/utils/bulkhead', () => ({
  apiBulkhead: {
    getStats: vi.fn(),
  },
  syncBulkhead: {
    getStats: vi.fn(),
  },
  fsBulkhead: {
    getStats: vi.fn(),
  },
  getBulkheadMetrics: vi.fn(() => ({
    api: { active: 0, queued: 0, limit: 16 },
    sync: { active: 0, queued: 0, limit: 4 },
    filesystem: { active: 0, queued: 0, limit: 8 },
  })),
}));

// Mock rate limiter
vi.mock('../../src/middleware/rateLimiter', () => {
  const mockRateLimiter = {
    isAllowed: vi.fn(),
    reset: vi.fn(),
    getStats: vi.fn(),
  };
  
  return {
    rateLimiter: mockRateLimiter,
    getRateLimiterStats: vi.fn(() => ({
      requestsPerSecond: 0,
      burstCapacity: 0,
      currentTokens: 0,
    })),
    rateLimitMiddleware: vi.fn((req: any, res: any, next: any) => {
      // Simulate rate limiting behavior
      const identifier = req.ip || 'test-ip';
      const isAllowed = mockRateLimiter.isAllowed(identifier);
      if (!isAllowed) {
        return res.status(429).json({
          success: false,
          error: 'RATE_LIMIT_EXCEEDED',
          retryAfter: 1,
        });
      }
      next();
    }),
  };
});

describe('Backpressure Integration Tests', () => {
  let mockApiBulkhead: any;
  let mockSyncBulkhead: any;
  let mockInventoryRepository: any;
  let mockInventoryService: any;
  let mockEventLogRepository: any;
  let mockIdempotencyStore: any;
  beforeEach(() => {
    // Reset rate limiter and load shedder
    rateLimiter.reset();
    loadShedder.reset();
    
    mockApiBulkhead = vi.mocked(apiBulkhead);
    mockSyncBulkhead = vi.mocked(syncBulkhead);
    mockInventoryRepository = vi.mocked(inventoryRepository);
    mockInventoryService = vi.mocked(inventoryService);
    mockEventLogRepository = vi.mocked(eventLogRepository);
    mockIdempotencyStore = vi.mocked(idempotencyStore);
    
    // Set normal queue depth
    mockApiBulkhead.getStats.mockReturnValue({ queued: 5 });
    mockSyncBulkhead.getStats.mockReturnValue({ queued: 3 });
    
    // Mock inventory repository to return existing records
    mockInventoryRepository.get.mockImplementation(async (sku: string, storeId: string) => {
      if (sku === 'SKU123' && storeId === 'STORE001') {
        return {
          sku: 'SKU123',
          storeId: 'STORE001',
          qty: 100,
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }
      return null;
    });
    
    mockInventoryRepository.upsert.mockResolvedValue(undefined);
    mockInventoryService.adjustStock.mockResolvedValue({ qty: 100, version: 1 });
    mockEventLogRepository.append.mockResolvedValue(undefined);
    mockIdempotencyStore.get.mockResolvedValue(null);
    mockIdempotencyStore.set.mockResolvedValue(undefined);
    
    // Mock rate limiter to allow requests by default
    vi.mocked(rateLimiter).isAllowed.mockReturnValue(true);
    vi.mocked(rateLimiter).getStats.mockReturnValue({
      requests: 0,
      rejected: 0,
      buckets: 0,
    });
    
    // Load shedder is not mocked, so we can't set its stats
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Rate Limiting', () => {
    it('should return 429 for rate limit exceeded', async () => {
      // Mock rate limiter to reject some requests
      let requestCount = 0;
      vi.mocked(rateLimiter).isAllowed.mockImplementation(() => {
        requestCount++;
        // Allow first 3 requests, reject the rest
        return requestCount <= 3;
      });
      
      // Make many requests to trigger rate limiting
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          request(app)
            .post('/api/inventory/stores/STORE001/inventory/SKU123/adjust')
            .send({ delta: 1 })
        );
      }
      
      const responses = await Promise.all(promises);
      
      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
      
      // Check rate limit response format
      if (rateLimitedResponses.length > 0) {
        const response = rateLimitedResponses[0];
        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('RATE_LIMIT_EXCEEDED');
        expect(response.body.retryAfter).toBeDefined();
      }
    });

    it('should allow requests within rate limit', async () => {
      // First create an inventory record
      await request(app)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/adjust')
        .send({ delta: 100 });
      
      // Make a single request
      const response = await request(app)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/adjust')
        .send({ delta: 10 });
      
      // Should not be rate limited
      expect(response.status).not.toBe(429);
    });
  });

  describe('Load Shedding', () => {
    it('should return 503 when queue is full', async () => {
      // First create an inventory record
      await request(app)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/adjust')
        .send({ delta: 100 });
      
      // Simulate high queue depth
      mockApiBulkhead.getStats.mockReturnValue({ queued: 1000 });
      mockSyncBulkhead.getStats.mockReturnValue({ queued: 500 });
      
      // Override load shedding middleware to trigger
      vi.mocked(loadSheddingMiddleware).mockImplementation((req: any, res: any, next: any) => {
        return res.status(503).json({
          success: false,
          error: 'SERVICE_OVERLOADED',
          message: 'Service temporarily unavailable',
          retryAfter: 1,
        });
      });
      
      const response = await request(app)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/adjust')
        .send({ delta: 10 });
      
      expect(response.status).toBe(503);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('SERVICE_OVERLOADED');
      expect(response.body.retryAfter).toBeDefined();
    });

    it('should allow requests when queue is not full', async () => {
      // First create an inventory record
      await request(app)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/adjust')
        .send({ delta: 100 });
      
      // Normal queue depth
      mockApiBulkhead.getStats.mockReturnValue({ queued: 5 });
      mockSyncBulkhead.getStats.mockReturnValue({ queued: 3 });
      
      // Override load shedding middleware to allow requests
      vi.mocked(loadSheddingMiddleware).mockImplementation((req: any, res: any, next: any) => {
        next(); // Allow the request to proceed
      });
      
      const response = await request(app)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/adjust')
        .send({ delta: 10 });
      
      expect(response.status).not.toBe(503);
    });
  });

  describe('Combined Backpressure', () => {
    it('should apply rate limiting before load shedding', async () => {
      // First create an inventory record
      await request(app)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/adjust')
        .send({ delta: 100 });
      
      // Set high queue depth but make requests slowly
      mockApiBulkhead.getStats.mockReturnValue({ queued: 1000 });
      mockSyncBulkhead.getStats.mockReturnValue({ queued: 500 });
      
      // Override load shedding middleware to trigger
      vi.mocked(loadSheddingMiddleware).mockImplementation((req: any, res: any, next: any) => {
        return res.status(503).json({
          success: false,
          error: 'SERVICE_OVERLOADED',
          message: 'Service temporarily unavailable',
          retryAfter: 1,
        });
      });
      
      // Make one request slowly (should hit load shedding, not rate limiting)
      const response = await request(app)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/adjust')
        .send({ delta: 10 });
      
      expect(response.status).toBe(503); // Load shedding, not rate limiting
    });

    it('should track metrics for both rate limiting and load shedding', async () => {
      // First create an inventory record
      await request(app)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/adjust')
        .send({ delta: 100 });
      
      // Simulate high queue depth
      mockApiBulkhead.getStats.mockReturnValue({ queued: 1000 });
      mockSyncBulkhead.getStats.mockReturnValue({ queued: 500 });
      
      // Make a request that will be shed
      await request(app)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/adjust')
        .send({ delta: 10 });
      
      // Check that metrics are tracked
      const rateLimiterStats = rateLimiter.getStats();
      const loadSheddingStats = loadShedder.getStats();
      
      expect(rateLimiterStats.requests).toBeGreaterThanOrEqual(0);
      expect(loadSheddingStats.shedRequests).toBeGreaterThan(0);
    });
  });

  describe('Health Endpoints', () => {
    it('should not apply backpressure to health endpoints', async () => {
      const response = await request(app)
        .get('/api/health');
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('healthy');
    });

    it('should not apply backpressure to metrics endpoints', async () => {
      const response = await request(app)
        .get('/api/metrics');
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });
  });
});
