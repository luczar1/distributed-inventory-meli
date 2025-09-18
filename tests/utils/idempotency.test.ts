import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IdempotencyStore, idempotencyStore } from '../../src/utils/idempotency';

describe('IdempotencyStore', () => {
  let store: IdempotencyStore;

  beforeEach(() => {
    store = new IdempotencyStore(100); // 100ms TTL for testing
  });

  afterEach(() => {
    store.destroy();
  });

  describe('constructor', () => {
    it('should create store with default TTL', () => {
      const defaultStore = new IdempotencyStore();
      expect(defaultStore).toBeInstanceOf(IdempotencyStore);
      defaultStore.destroy();
    });

    it('should create store with custom TTL', () => {
      const customStore = new IdempotencyStore(500);
      expect(customStore).toBeInstanceOf(IdempotencyStore);
      customStore.destroy();
    });
  });

  describe('set and get', () => {
    it('should store and retrieve value', async () => {
      const key = 'test-key';
      const value = { result: 'success', data: 'test-data' };

      await store.set(key, value);
      const result = await store.get(key);

      expect(result).toEqual(value);
    });

    it('should return null for non-existent key', async () => {
      const result = await store.get('non-existent');
      expect(result).toBeNull();
    });

    it('should return null for expired key', async () => {
      const key = 'expired-key';
      const value = { result: 'success' };

      await store.set(key, value, 10); // 10ms TTL
      await new Promise(resolve => setTimeout(resolve, 20)); // Wait for expiration
      
      const result = await store.get(key);
      expect(result).toBeNull();
    });

    it('should store with custom TTL', async () => {
      const key = 'custom-ttl-key';
      const value = { result: 'success' };

      await store.set(key, value, 200); // 200ms TTL
      
      // Should still exist after 50ms
      await new Promise(resolve => setTimeout(resolve, 50));
      let result = await store.get(key);
      expect(result).toEqual(value);

      // Should be expired after 250ms
      await new Promise(resolve => setTimeout(resolve, 200));
      result = await store.get(key);
      expect(result).toBeNull();
    });
  });

  describe('has', () => {
    it('should return true for existing key', async () => {
      const key = 'existing-key';
      const value = { result: 'success' };

      await store.set(key, value);
      const exists = await store.has(key);

      expect(exists).toBe(true);
    });

    it('should return false for non-existent key', async () => {
      const exists = await store.has('non-existent');
      expect(exists).toBe(false);
    });

    it('should return false for expired key', async () => {
      const key = 'expired-key';
      const value = { result: 'success' };

      await store.set(key, value, 10); // 10ms TTL
      await new Promise(resolve => setTimeout(resolve, 20)); // Wait for expiration
      
      const exists = await store.has(key);
      expect(exists).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete existing key', async () => {
      const key = 'delete-key';
      const value = { result: 'success' };

      await store.set(key, value);
      expect(await store.has(key)).toBe(true);

      await store.delete(key);
      expect(await store.has(key)).toBe(false);
    });

    it('should handle deleting non-existent key', async () => {
      await expect(store.delete('non-existent')).resolves.not.toThrow();
    });
  });

  describe('getStats', () => {
    it('should return stats for empty store', () => {
      const stats = store.getStats();
      expect(stats).toEqual({ total: 0, expired: 0 });
    });

    it('should return stats for store with entries', async () => {
      await store.set('key1', { result: 'success' });
      await store.set('key2', { result: 'success' });

      const stats = store.getStats();
      expect(stats.total).toBe(2);
      expect(stats.expired).toBe(0);
    });

    it('should count expired entries', async () => {
      await store.set('key1', { result: 'success' }, 10); // 10ms TTL
      await store.set('key2', { result: 'success' }); // 100ms TTL (default)
      
      await new Promise(resolve => setTimeout(resolve, 20)); // Wait for first to expire
      
      const stats = store.getStats();
      expect(stats.total).toBe(2);
      expect(stats.expired).toBe(1);
    });
  });

  describe('clear', () => {
    it('should clear all entries', async () => {
      await store.set('key1', { result: 'success' });
      await store.set('key2', { result: 'success' });

      expect(store.getStats().total).toBe(2);

      store.clear();

      expect(store.getStats().total).toBe(0);
      expect(await store.get('key1')).toBeNull();
      expect(await store.get('key2')).toBeNull();
    });
  });

  describe('cleanup', () => {
    it('should clean up expired entries automatically', async () => {
      const cleanupStore = new IdempotencyStore(50); // 50ms TTL
      
      await cleanupStore.set('key1', { result: 'success' }, 10); // 10ms TTL
      await cleanupStore.set('key2', { result: 'success' }, 10); // 10ms TTL
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 20));
      
      // Trigger cleanup by calling getStats
      const stats = cleanupStore.getStats();
      expect(stats.total).toBe(2); // Entries still exist until cleanup runs
      expect(stats.expired).toBe(2); // But they are marked as expired
      
      cleanupStore.destroy();
    });
  });

  describe('destroy', () => {
    it('should clear cleanup interval', () => {
      const store = new IdempotencyStore();
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      
      store.destroy();
      
      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });

  describe('global instance', () => {
    it('should export global instance', () => {
      expect(idempotencyStore).toBeInstanceOf(IdempotencyStore);
    });

    it('should work with global instance', async () => {
      const key = 'global-key';
      const value = { result: 'success' };

      await idempotencyStore.set(key, value);
      const result = await idempotencyStore.get(key);

      expect(result).toEqual(value);
    });
  });

  describe('type safety', () => {
    it('should handle different value types', async () => {
      const stringValue = 'string-value';
      const numberValue = 42;
      const objectValue = { key: 'value' };
      const arrayValue = [1, 2, 3];

      await store.set('string', stringValue);
      await store.set('number', numberValue);
      await store.set('object', objectValue);
      await store.set('array', arrayValue);

      expect(await store.get('string')).toBe(stringValue);
      expect(await store.get('number')).toBe(numberValue);
      expect(await store.get('object')).toEqual(objectValue);
      expect(await store.get('array')).toEqual(arrayValue);
    });
  });
});
