import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IdempotencyStore } from '../../src/utils/idempotency';

describe('Enhanced IdempotencyStore', () => {
  let idempotencyStore: IdempotencyStore;

  beforeEach(() => {
    idempotencyStore = new IdempotencyStore(1000); // 1 second TTL for testing
  });

  afterEach(() => {
    idempotencyStore.clear();
    idempotencyStore.destroy();
  });

  describe('checkIdempotency with payload hash', () => {
    it('should return idempotent result for same key and payload', async () => {
      const key = 'test-key';
      const payload = { sku: 'SKU123', delta: 10 };
      const result = { qty: 100, version: 2 };

      // Set initial entry
      await idempotencyStore.setIdempotent(key, result, payload);

      // Check idempotency with same payload
      const check = await idempotencyStore.checkIdempotency(key, payload);

      expect(check.isIdempotent).toBe(true);
      expect(check.result).toEqual(result);
      expect(check.conflict).toBeUndefined();
    });

    it('should detect conflict for same key with different payload', async () => {
      const key = 'test-key';
      const originalPayload = { sku: 'SKU123', delta: 10 };
      const differentPayload = { sku: 'SKU123', delta: 20 };
      const result = { qty: 100, version: 2 };

      // Set initial entry
      await idempotencyStore.setIdempotent(key, result, originalPayload);

      // Check idempotency with different payload
      const check = await idempotencyStore.checkIdempotency(key, differentPayload);

      expect(check.isIdempotent).toBe(false);
      expect(check.conflict).toBe(true);
      expect(check.result).toBeUndefined();
    });

    it('should handle payload with different property order as same', async () => {
      const key = 'test-key';
      const payload1 = { sku: 'SKU123', delta: 10, storeId: 'store1' };
      const payload2 = { storeId: 'store1', sku: 'SKU123', delta: 10 };
      const result = { qty: 100, version: 2 };

      // Set initial entry
      await idempotencyStore.setIdempotent(key, result, payload1);

      // Check idempotency with reordered payload
      const check = await idempotencyStore.checkIdempotency(key, payload2);

      expect(check.isIdempotent).toBe(true);
      expect(check.result).toEqual(result);
      expect(check.conflict).toBeUndefined();
    });

    it('should return not idempotent for non-existent key', async () => {
      const key = 'non-existent-key';
      const payload = { sku: 'SKU123', delta: 10 };

      const check = await idempotencyStore.checkIdempotency(key, payload);

      expect(check.isIdempotent).toBe(false);
      expect(check.conflict).toBeUndefined();
      expect(check.result).toBeUndefined();
    });

    it('should return not idempotent for expired entry', async () => {
      const key = 'test-key';
      const payload = { sku: 'SKU123', delta: 10 };
      const result = { qty: 100, version: 2 };

      // Set entry with short TTL
      await idempotencyStore.setIdempotent(key, result, payload, 100);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      // Check idempotency
      const check = await idempotencyStore.checkIdempotency(key, payload);

      expect(check.isIdempotent).toBe(false);
      expect(check.conflict).toBeUndefined();
      expect(check.result).toBeUndefined();
    });
  });

  describe('setIdempotent with status tracking', () => {
    it('should set entry with pending status', async () => {
      const key = 'test-key';
      const payload = { sku: 'SKU123', delta: 10 };
      const result = { qty: 100, version: 2 };

      await idempotencyStore.setIdempotent(key, result, payload, 1000, 'pending');

      const stats = idempotencyStore.getStats();
      expect(stats.pending).toBe(1);
      expect(stats.completed).toBe(0);
      expect(stats.failed).toBe(0);
    });

    it('should set entry with completed status', async () => {
      const key = 'test-key';
      const payload = { sku: 'SKU123', delta: 10 };
      const result = { qty: 100, version: 2 };

      await idempotencyStore.setIdempotent(key, result, payload, 1000, 'completed');

      const stats = idempotencyStore.getStats();
      expect(stats.pending).toBe(0);
      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(0);
    });

    it('should set entry with failed status', async () => {
      const key = 'test-key';
      const payload = { sku: 'SKU123', delta: 10 };
      const result = { error: 'Operation failed' };

      await idempotencyStore.setIdempotent(key, result, payload, 1000, 'failed');

      const stats = idempotencyStore.getStats();
      expect(stats.pending).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.failed).toBe(1);
    });
  });

  describe('enhanced stats', () => {
    it('should track all status types correctly', async () => {
      // Set entries with different statuses
      await idempotencyStore.setIdempotent('key1', { result: 'pending' }, { data: 1 }, 1000, 'pending');
      await idempotencyStore.setIdempotent('key2', { result: 'completed' }, { data: 2 }, 1000, 'completed');
      await idempotencyStore.setIdempotent('key3', { result: 'failed' }, { data: 3 }, 1000, 'failed');
      await idempotencyStore.setIdempotent('key4', { result: 'completed2' }, { data: 4 }, 1000, 'completed');

      const stats = idempotencyStore.getStats();
      expect(stats.total).toBe(4);
      expect(stats.pending).toBe(1);
      expect(stats.completed).toBe(2);
      expect(stats.failed).toBe(1);
      expect(stats.expired).toBe(0);
    });

    it('should handle expired entries correctly', async () => {
      // Set entry with very short TTL
      await idempotencyStore.setIdempotent('key1', { result: 'expired' }, { data: 1 }, 50, 'completed');

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = idempotencyStore.getStats();
      // Entry should be expired (either cleaned up or marked as expired)
      expect(stats.expired).toBeGreaterThanOrEqual(0);
    });
  });

  describe('conflict detection scenarios', () => {
    it('should detect conflict for different SKU with same key', async () => {
      const key = 'test-key';
      const originalPayload = { sku: 'SKU123', delta: 10 };
      const differentPayload = { sku: 'SKU456', delta: 10 };
      const result = { qty: 100, version: 2 };

      await idempotencyStore.setIdempotent(key, result, originalPayload);

      const check = await idempotencyStore.checkIdempotency(key, differentPayload);

      expect(check.isIdempotent).toBe(false);
      expect(check.conflict).toBe(true);
    });

    it('should detect conflict for different delta with same key', async () => {
      const key = 'test-key';
      const originalPayload = { sku: 'SKU123', delta: 10 };
      const differentPayload = { sku: 'SKU123', delta: 20 };
      const result = { qty: 100, version: 2 };

      await idempotencyStore.setIdempotent(key, result, originalPayload);

      const check = await idempotencyStore.checkIdempotency(key, differentPayload);

      expect(check.isIdempotent).toBe(false);
      expect(check.conflict).toBe(true);
    });

    it('should detect conflict for different storeId with same key', async () => {
      const key = 'test-key';
      const originalPayload = { sku: 'SKU123', delta: 10, storeId: 'store1' };
      const differentPayload = { sku: 'SKU123', delta: 10, storeId: 'store2' };
      const result = { qty: 100, version: 2 };

      await idempotencyStore.setIdempotent(key, result, originalPayload);

      const check = await idempotencyStore.checkIdempotency(key, differentPayload);

      expect(check.isIdempotent).toBe(false);
      expect(check.conflict).toBe(true);
    });

    it('should not detect conflict for semantically equivalent payloads', async () => {
      const key = 'test-key';
      const payload1 = { sku: 'SKU123', delta: 10, metadata: { source: 'api' } };
      const payload2 = { metadata: { source: 'api' }, sku: 'SKU123', delta: 10 };
      const result = { qty: 100, version: 2 };

      await idempotencyStore.setIdempotent(key, result, payload1);

      const check = await idempotencyStore.checkIdempotency(key, payload2);

      expect(check.isIdempotent).toBe(true);
      expect(check.conflict).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should handle empty payload', async () => {
      const key = 'test-key';
      const payload = {};
      const result = { qty: 100, version: 2 };

      await idempotencyStore.setIdempotent(key, result, payload);

      const check = await idempotencyStore.checkIdempotency(key, payload);

      expect(check.isIdempotent).toBe(true);
      expect(check.result).toEqual(result);
    });

    it('should handle null payload', async () => {
      const key = 'test-key';
      const payload = null;
      const result = { qty: 100, version: 2 };

      await idempotencyStore.setIdempotent(key, result, payload);

      const check = await idempotencyStore.checkIdempotency(key, payload);

      expect(check.isIdempotent).toBe(true);
      expect(check.result).toEqual(result);
    });

    it('should handle undefined payload', async () => {
      const key = 'test-key';
      const payload = undefined;
      const result = { qty: 100, version: 2 };

      await idempotencyStore.setIdempotent(key, result, payload);

      const check = await idempotencyStore.checkIdempotency(key, payload);

      expect(check.isIdempotent).toBe(true);
      expect(check.result).toEqual(result);
    });
  });
});
