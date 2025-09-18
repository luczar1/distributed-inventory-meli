import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CircuitBreaker } from '../../src/utils/circuitBreaker';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;
  let mockOperation: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({
      name: 'test',
      failureThreshold: 2, // 2 failures to open
      cooldownMs: 1000,
      timeoutMs: 5000,
    });
    mockOperation = vi.fn();
    vi.clearAllMocks();
  });

  describe('Closed State', () => {
    it('should execute operation successfully', async () => {
      mockOperation.mockResolvedValue('success');
      
      const result = await circuitBreaker.execute(mockOperation);
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should track failures and successes', async () => {
      mockOperation.mockResolvedValueOnce('success');
      mockOperation.mockRejectedValueOnce(new Error('failure'));
      
      await circuitBreaker.execute(mockOperation);
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('failure');
      
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });

    it('should transition to open state when failure threshold is exceeded', async () => {
      // Set up failures to exceed threshold of 2
      mockOperation.mockRejectedValue(new Error('failure'));
      
      // First 2 calls should execute and fail
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('failure');
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('failure');
      
      // 3rd call should trigger open state
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('Circuit breaker test is open');
      
      expect(mockOperation).toHaveBeenCalledTimes(2); // Only first 2 should execute
    });
  });

  describe('Open State', () => {
    beforeEach(async () => {
      // Force circuit breaker to open state
      mockOperation.mockRejectedValue(new Error('failure'));
      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreaker.execute(mockOperation);
        } catch {
          // Ignore errors
        }
      }
    });

    it('should reject operations immediately without executing them', async () => {
      mockOperation.mockResolvedValue('success');
      
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('Circuit breaker test is open');
      
      // Operation should not be called
      expect(mockOperation).not.toHaveBeenCalled();
    });

    it('should transition to half-open state after cooldown period', async () => {
      // Wait for cooldown period
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      mockOperation.mockResolvedValue('success');
      
      const result = await circuitBreaker.execute(mockOperation);
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });
  });

  describe('Half-Open State', () => {
    beforeEach(async () => {
      // Force circuit breaker to open state
      mockOperation.mockRejectedValue(new Error('failure'));
      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreaker.execute(mockOperation);
        } catch {
          // Ignore errors
        }
      }
      
      // Wait for cooldown to enter half-open state
      await new Promise(resolve => setTimeout(resolve, 1100));
    });

    it('should allow one probe operation', async () => {
      mockOperation.mockResolvedValue('success');
      
      const result = await circuitBreaker.execute(mockOperation);
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should transition back to closed state on successful probe', async () => {
      mockOperation.mockResolvedValue('success');
      
      // First call should succeed and close the circuit
      await circuitBreaker.execute(mockOperation);
      
      // Second call should also succeed (circuit is closed)
      await circuitBreaker.execute(mockOperation);
      
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });

    it('should transition back to open state on failed probe', async () => {
      mockOperation.mockRejectedValue(new Error('failure'));
      
      // First call should fail and reopen the circuit
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('failure');
      
      // Second call should be rejected immediately (circuit is open again)
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('Circuit breaker test is open');
      
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });
  });

  describe('Timeout Handling', () => {
    it('should timeout slow operations', async () => {
      mockOperation.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 6000)) // 6 seconds > 5 second timeout
      );
      
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('Circuit breaker test timeout');
    });

    it('should not timeout fast operations', async () => {
      mockOperation.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 100)) // 100ms < 5 second timeout
      );
      
      const result = await circuitBreaker.execute(mockOperation);
      
      expect(result).toBeUndefined();
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });
  });

  describe('State Transitions', () => {
    it('should track state transitions correctly', async () => {
      expect(circuitBreaker.getStats().state).toBe('closed');
      
      // Force to open state
      mockOperation.mockRejectedValue(new Error('failure'));
      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreaker.execute(mockOperation);
        } catch {
          // Ignore errors
        }
      }
      
      expect(circuitBreaker.getStats().state).toBe('open');
      
      // Wait for cooldown
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // First call after cooldown should be half-open
      mockOperation.mockResolvedValue('success');
      await circuitBreaker.execute(mockOperation);
      
      expect(circuitBreaker.getStats().state).toBe('closed');
    });
  });

  describe('Metrics', () => {
    it('should track operation counts', async () => {
      mockOperation.mockResolvedValue('success');
      
      await circuitBreaker.execute(mockOperation);
      await circuitBreaker.execute(mockOperation);
      
      const stats = circuitBreaker.getStats();
      expect(stats.successes).toBe(2);
      expect(stats.failures).toBe(0);
    });

    it('should track failure counts', async () => {
      mockOperation.mockRejectedValue(new Error('failure'));
      
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('failure');
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('failure');
      
      const stats = circuitBreaker.getStats();
      expect(stats.successes).toBe(0);
      expect(stats.failures).toBe(2);
    });

    it('should track state transitions', async () => {
      // Force to open state
      mockOperation.mockRejectedValue(new Error('failure'));
      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreaker.execute(mockOperation);
        } catch {
          // Ignore errors
        }
      }
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe('open');
    });
  });

  describe('Reset', () => {
    it('should reset circuit breaker to initial state', async () => {
      // Force to open state
      mockOperation.mockRejectedValue(new Error('failure'));
      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreaker.execute(mockOperation);
        } catch {
          // Ignore errors
        }
      }
      
      expect(circuitBreaker.getStats().state).toBe('open');
      
      circuitBreaker.reset();
      
      expect(circuitBreaker.getStats().state).toBe('closed');
      
      const stats = circuitBreaker.getStats();
      expect(stats.successes).toBe(0);
      expect(stats.failures).toBe(0);
    });
  });
});
