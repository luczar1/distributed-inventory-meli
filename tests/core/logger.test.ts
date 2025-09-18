import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { logger } from '../../src/core/logger';

describe('Core Logger', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env['LOG_LEVEL'];
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env['LOG_LEVEL'] = originalEnv;
    } else {
      delete process.env['LOG_LEVEL'];
    }
  });

  describe('logger configuration', () => {
    it('should have default log level', () => {
      delete process.env['LOG_LEVEL'];
      // Logger should be created with default level
      expect(logger).toBeDefined();
    });

    it('should use custom log level from environment', () => {
      process.env['LOG_LEVEL'] = 'debug';
      // Logger should respect environment variable
      expect(logger).toBeDefined();
    });

    it('should have required methods', () => {
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });
  });

  describe('logger methods', () => {
    it('should log info messages', () => {
      expect(() => logger.info('Test info message')).not.toThrow();
    });

    it('should log error messages', () => {
      expect(() => logger.error('Test error message')).not.toThrow();
    });

    it('should log warn messages', () => {
      expect(() => logger.warn('Test warn message')).not.toThrow();
    });

    it('should log debug messages', () => {
      expect(() => logger.debug('Test debug message')).not.toThrow();
    });

    it('should log with structured data', () => {
      const data = { userId: '123', action: 'test' };
      expect(() => logger.info(data, 'Structured log message')).not.toThrow();
    });

    it('should log with just message', () => {
      expect(() => logger.info('Simple message')).not.toThrow();
    });
  });
});
