import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PerKeyMutex, perKeyMutex } from '../../src/utils/perKeyMutex';

describe('PerKeyMutex', () => {
  let mutex: PerKeyMutex;

  beforeEach(() => {
    mutex = new PerKeyMutex();
  });

  describe('acquire', () => {
    it('should execute function immediately when no lock exists', async () => {
      const fn = vi.fn().mockResolvedValue('result');
      const result = await mutex.acquire('key1', fn);

      expect(result).toBe('result');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should serialize functions by key', async () => {
      const results: string[] = [];
      const fn1 = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        results.push('fn1');
        return 'result1';
      });
      const fn2 = vi.fn().mockImplementation(async () => {
        results.push('fn2');
        return 'result2';
      });

      const promise1 = mutex.acquire('key1', fn1);
      const promise2 = mutex.acquire('key1', fn2);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toBe('result1');
      expect(result2).toBe('result2');
      expect(results).toEqual(['fn1', 'fn2']); // fn2 should wait for fn1
    });

    it('should allow parallel execution for different keys', async () => {
      const results: string[] = [];
      const fn1 = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        results.push('fn1');
        return 'result1';
      });
      const fn2 = vi.fn().mockImplementation(async () => {
        results.push('fn2');
        return 'result2';
      });

      const promise1 = mutex.acquire('key1', fn1);
      const promise2 = mutex.acquire('key2', fn2);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toBe('result1');
      expect(result2).toBe('result2');
      expect(results).toEqual(['fn2', 'fn1']); // fn2 should execute first
    });

    it('should handle function errors', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Function error'));

      await expect(mutex.acquire('key1', fn)).rejects.toThrow('Function error');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should clean up lock after execution', async () => {
      const fn = vi.fn().mockResolvedValue('result');
      
      await mutex.acquire('key1', fn);
      
      expect(mutex.getLockStatus()).toEqual({});
    });

    it('should clean up lock after error', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Function error'));
      
      await expect(mutex.acquire('key1', fn)).rejects.toThrow();
      
      expect(mutex.getLockStatus()).toEqual({});
    });
  });

  describe('getLockStatus', () => {
    it('should return empty object when no locks', () => {
      expect(mutex.getLockStatus()).toEqual({});
    });

    it('should return current locks', async () => {
      const fn = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'result';
      });

      const promise = mutex.acquire('key1', fn);
      
      expect(mutex.getLockStatus()).toEqual({ key1: true });
      
      await promise;
    });
  });

  describe('clear', () => {
    it('should clear all locks', async () => {
      const fn = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'result';
      });

      mutex.acquire('key1', fn);
      mutex.acquire('key2', fn);
      
      expect(mutex.getLockStatus()).toEqual({ key1: true, key2: true });
      
      mutex.clear();
      
      expect(mutex.getLockStatus()).toEqual({});
    });
  });

  describe('global instance', () => {
    it('should export global instance', () => {
      expect(perKeyMutex).toBeInstanceOf(PerKeyMutex);
    });

    it('should work with global instance', async () => {
      const fn = vi.fn().mockResolvedValue('result');
      const result = await perKeyMutex.acquire('global-key', fn);

      expect(result).toBe('result');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});
