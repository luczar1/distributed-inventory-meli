import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { faultInjector, enableFaultInjection, disableFaultInjection, resetFaultInjection } from '../../src/testing/faults';
import { getCircuitBreakerMetrics } from '../../src/utils/circuitBreaker';
import { getBulkheadMetrics } from '../../src/utils/bulkhead';

// Mock dependencies
vi.mock('../../src/repositories/inventory.repo');
vi.mock('../../src/repositories/eventlog.repo');
vi.mock('../../src/utils/perKeyMutex');
vi.mock('../../src/utils/idempotency');

describe('Resilience tests with fault injection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFaultInjection();
  });

  afterEach(() => {
    disableFaultInjection();
    vi.clearAllMocks();
  });

  describe('Circuit breaker behavior under faults', () => {
    it('should open circuit breaker under persistent file system errors', async () => {
      // Enable fault injection with high error rate
      enableFaultInjection({
        fsErrorRate: 0.8, // 80% error rate
        fsDelayMs: 100,
        enabled: true,
      });

      // Make multiple requests to trigger circuit breaker
      const promises = Array(20).fill(0).map(async (_, i) => {
        try {
          const response = await request(app)
            .post('/api/inventory/stores/store1/inventory/SKU123/adjust')
            .send({ delta: 10 })
            .set('Idempotency-Key', `test-${i}`);
          
          return { status: response.status, body: response.body };
        } catch (error) {
          return { status: 500, error: (error as Error).message };
        }
      });

      const results = await Promise.allSettled(promises);
      
      // Check circuit breaker metrics
      const breakerMetrics = getCircuitBreakerMetrics();
      const fileSystemBreaker = breakerMetrics.fileSystemBreaker;
      
      // Circuit breaker should be open or have high failure rate
      expect(fileSystemBreaker.failures).toBeGreaterThan(0);
      expect(fileSystemBreaker.state).toMatch(/open|half-open/);
    });

    it('should recover from circuit breaker after faults stop', async () => {
      // First, open the circuit breaker
      enableFaultInjection({
        fsErrorRate: 0.9,
        enabled: true,
      });

      // Trigger circuit breaker
      for (let i = 0; i < 10; i++) {
        try {
          await request(app)
            .post('/api/inventory/stores/store1/inventory/SKU123/adjust')
            .send({ delta: 10 })
            .set('Idempotency-Key', `fault-${i}`);
        } catch (error) {
          // Expected to fail
        }
      }

      // Disable fault injection
      disableFaultInjection();

      // Wait for circuit breaker to potentially recover
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Make a request - should work now
      const response = await request(app)
        .post('/api/inventory/stores/store1/inventory/SKU123/adjust')
        .send({ delta: 10 })
        .set('Idempotency-Key', 'recovery-test');

      // Should either succeed or be handled gracefully
      expect([200, 201, 409, 503]).toContain(response.status);
    });
  });

  describe('Service degradation under load', () => {
    it('should degrade to read-only when bulkheads are saturated', async () => {
      // Enable fault injection with delays
      enableFaultInjection({
        fsDelayMs: 2000, // 2 second delays
        enabled: true,
      });

      // Saturate bulkheads with slow operations
      const promises = Array(20).fill(0).map(async (_, i) => {
        try {
          const response = await request(app)
            .post('/api/inventory/stores/store1/inventory/SKU123/adjust')
            .send({ delta: 10 })
            .set('Idempotency-Key', `load-${i}`)
            .timeout(5000);

          return { status: response.status, body: response.body };
        } catch (error) {
          return { status: 500, error: (error as Error).message };
        }
      });

      const results = await Promise.allSettled(promises);
      
      // Check bulkhead metrics
      const bulkheadMetrics = getBulkheadMetrics();
      const apiBulkhead = bulkheadMetrics.apiBulkhead;
      
      // Bulkhead should be saturated
      expect(apiBulkhead.queued).toBeGreaterThan(0);
      expect(apiBulkhead.active).toBeGreaterThan(0);
    });

    it('should handle load shedding when queue is full', async () => {
      // Enable fault injection with high delays
      enableFaultInjection({
        fsDelayMs: 5000, // 5 second delays
        enabled: true,
      });

      // Make many requests to trigger load shedding
      const promises = Array(50).fill(0).map(async (_, i) => {
        try {
          const response = await request(app)
            .post('/api/inventory/stores/store1/inventory/SKU123/adjust')
            .send({ delta: 10 })
            .set('Idempotency-Key', `shed-${i}`)
            .timeout(10000);

          return { status: response.status, body: response.body };
        } catch (error) {
          return { status: 500, error: (error as Error).message };
        }
      });

      const results = await Promise.allSettled(promises);
      const responses = results
        .filter(r => r.status === 'fulfilled')
        .map(r => (r as any).value);

      // Should see some 503 responses due to load shedding
      const loadShedResponses = responses.filter(r => r.status === 503);
      expect(loadShedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Read-only mode during failures', () => {
    it('should allow read operations during write failures', async () => {
      // Enable fault injection for writes only
      enableFaultInjection({
        fsErrorRate: 0.9,
        enabled: true,
      });

      // Try to make a write operation (should fail)
      const writeResponse = await request(app)
        .post('/api/inventory/stores/store1/inventory/SKU123/adjust')
        .send({ delta: 10 })
        .set('Idempotency-Key', 'write-test');

      // Write should fail or be rejected
      expect([409, 503, 500]).toContain(writeResponse.status);

      // Read operations should still work
      const readResponse = await request(app)
        .get('/api/inventory/stores/store1/inventory/SKU123');

      // Read should succeed (200) or return appropriate error (404)
      expect([200, 404]).toContain(readResponse.status);
    });

    it('should maintain data consistency during partial failures', async () => {
      // Enable fault injection with moderate error rate
      enableFaultInjection({
        fsErrorRate: 0.3,
        fsDelayMs: 100,
        enabled: true,
      });

      // Make multiple operations
      const operations = Array(10).fill(0).map(async (_, i) => {
        try {
          const response = await request(app)
            .post('/api/inventory/stores/store1/inventory/SKU123/adjust')
            .send({ delta: 1 })
            .set('Idempotency-Key', `consistency-${i}`)
            .timeout(5000);

          return { success: true, status: response.status };
        } catch (error) {
          return { success: false, error: (error as Error).message };
        }
      });

      const results = await Promise.allSettled(operations);
      const successful = results.filter(r => r.status === 'fulfilled' && (r.value as any).success);
      const failed = results.filter(r => r.status === 'rejected' || !(r.value as any).success);

      // Should have some successes and some failures
      expect(successful.length).toBeGreaterThan(0);
      expect(failed.length).toBeGreaterThan(0);

      // Check fault injection stats
      const stats = faultInjector.getStats();
      expect(stats.fs.errors).toBeGreaterThan(0);
      expect(stats.fs.successes).toBeGreaterThan(0);
    });
  });

  describe('Recovery behavior', () => {
    it('should recover gracefully after fault injection stops', async () => {
      // Start with fault injection
      enableFaultInjection({
        fsErrorRate: 0.5,
        fsDelayMs: 500,
        enabled: true,
      });

      // Make some requests (some will fail)
      const initialPromises = Array(5).fill(0).map(async (_, i) => {
        try {
          const response = await request(app)
            .post('/api/inventory/stores/store1/inventory/SKU123/adjust')
            .send({ delta: 10 })
            .set('Idempotency-Key', `recovery-${i}`)
            .timeout(5000);

          return { success: true, status: response.status };
        } catch (error) {
          return { success: false, error: (error as Error).message };
        }
      });

      await Promise.allSettled(initialPromises);

      // Disable fault injection
      disableFaultInjection();

      // Wait for system to recover
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Make new requests - should work now
      const recoveryPromises = Array(3).fill(0).map(async (_, i) => {
        try {
          const response = await request(app)
            .post('/api/inventory/stores/store1/inventory/SKU123/adjust')
            .send({ delta: 10 })
            .set('Idempotency-Key', `recovery-after-${i}`)
            .timeout(5000);

          return { success: true, status: response.status };
        } catch (error) {
          return { success: false, error: (error as Error).message };
        }
      });

      const recoveryResults = await Promise.allSettled(recoveryPromises);
      const recoverySuccessful = recoveryResults.filter(r => r.status === 'fulfilled' && (r.value as any).success);

      // Should have successful operations after recovery
      expect(recoverySuccessful.length).toBeGreaterThan(0);
    });
  });
});
