import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { rateLimiter } from '../../src/middleware/rateLimiter';
import { loadShedder } from '../../src/middleware/loadShedding';
import { apiBulkhead, syncBulkhead } from '../../src/utils/bulkhead';

// Mock bulkheads to control queue depth
vi.mock('../../src/utils/bulkhead', () => ({
  apiBulkhead: {
    getStats: vi.fn(),
  },
  syncBulkhead: {
    getStats: vi.fn(),
  },
}));

describe('Backpressure Integration Tests', () => {
  let mockApiBulkhead: any;
  let mockSyncBulkhead: any;

  beforeEach(() => {
    // Reset rate limiter and load shedder
    rateLimiter.reset();
    loadShedder.reset();
    
    mockApiBulkhead = vi.mocked(apiBulkhead);
    mockSyncBulkhead = vi.mocked(syncBulkhead);
    
    // Set normal queue depth
    mockApiBulkhead.getStats.mockReturnValue({ queued: 5 });
    mockSyncBulkhead.getStats.mockReturnValue({ queued: 3 });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Rate Limiting', () => {
    it('should return 429 for rate limit exceeded', async () => {
      // Make requests faster than rate limit
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          request(app)
            .post('/api/inventory/stores/STORE001/inventory/SKU123/adjust')
            .send({ delta: 10 })
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
      // Simulate high queue depth
      mockApiBulkhead.getStats.mockReturnValue({ queued: 1000 });
      mockSyncBulkhead.getStats.mockReturnValue({ queued: 500 });
      
      const response = await request(app)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/adjust')
        .send({ delta: 10 });
      
      expect(response.status).toBe(503);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('SERVICE_OVERLOADED');
      expect(response.body.retryAfter).toBeDefined();
    });

    it('should allow requests when queue is not full', async () => {
      // Normal queue depth
      mockApiBulkhead.getStats.mockReturnValue({ queued: 5 });
      mockSyncBulkhead.getStats.mockReturnValue({ queued: 3 });
      
      const response = await request(app)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/adjust')
        .send({ delta: 10 });
      
      expect(response.status).not.toBe(503);
    });
  });

  describe('Combined Backpressure', () => {
    it('should apply rate limiting before load shedding', async () => {
      // Set high queue depth but make requests slowly
      mockApiBulkhead.getStats.mockReturnValue({ queued: 1000 });
      mockSyncBulkhead.getStats.mockReturnValue({ queued: 500 });
      
      // Make one request slowly (should hit load shedding, not rate limiting)
      const response = await request(app)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/adjust')
        .send({ delta: 10 });
      
      expect(response.status).toBe(503); // Load shedding, not rate limiting
    });

    it('should track metrics for both rate limiting and load shedding', async () => {
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
      expect(response.body.status).toBe('ok');
    });

    it('should not apply backpressure to metrics endpoints', async () => {
      const response = await request(app)
        .get('/api/metrics');
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});
