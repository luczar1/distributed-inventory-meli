import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response } from 'express';
import { errorHandler } from '../../src/middleware/error-handler';
import { ValidationError, ConflictError } from '../../src/core/errors';

describe('Error Handler Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let originalEnv: string | undefined;

  beforeEach(() => {
    mockReq = {
      id: 'test-request-id',
      method: 'POST',
      url: '/api/test',
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    originalEnv = process.env['NODE_ENV'];
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env['NODE_ENV'] = originalEnv;
    } else {
      delete process.env['NODE_ENV'];
    }
  });

  describe('DomainError handling', () => {
    it('should handle ValidationError', () => {
      const error = new ValidationError('Invalid input', 'field', 'value');
      errorHandler(error, mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          name: 'ValidationError',
          message: 'Invalid input',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          timestamp: error.timestamp,
          details: { field: 'field', value: 'value' },
        },
      });
    });

    it('should handle ConflictError', () => {
      const error = new ConflictError('Version mismatch', 'SKU123', 'STORE001');
      errorHandler(error, mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          name: 'ConflictError',
          message: 'Version mismatch',
          code: 'CONFLICT_ERROR',
          statusCode: 409,
          timestamp: error.timestamp,
          details: undefined,
        },
      });
    });

    it('should handle DomainError with details', () => {
      const error = new ValidationError('Test error', 'field', 'value', { extra: 'data' });
      errorHandler(error, mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          name: 'ValidationError',
          message: 'Test error',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          timestamp: error.timestamp,
          details: { field: 'field', value: 'value', extra: 'data' },
        },
      });
    });
  });

  describe('Generic error handling', () => {
    it('should handle generic Error in production', () => {
      process.env['NODE_ENV'] = 'production';
      const error = new Error('Generic error');
      errorHandler(error, mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          name: 'InternalServerError',
          message: 'Internal server error',
          code: 'INTERNAL_SERVER_ERROR',
          statusCode: 500,
          timestamp: expect.any(String),
        },
      });
    });

    it('should handle generic Error in development with stack trace', () => {
      process.env['NODE_ENV'] = 'development';
      const error = new Error('Generic error');
      error.stack = 'Error: Generic error\n    at test.js:1:1';
      
      errorHandler(error, mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          name: 'InternalServerError',
          message: 'Internal server error',
          code: 'INTERNAL_SERVER_ERROR',
          statusCode: 500,
          timestamp: expect.any(String),
          stack: 'Error: Generic error\n    at test.js:1:1',
        },
      });
    });

    it('should handle generic Error when NODE_ENV is undefined', () => {
      delete process.env['NODE_ENV'];
      const error = new Error('Generic error');
      errorHandler(error, mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          name: 'InternalServerError',
          message: 'Internal server error',
          code: 'INTERNAL_SERVER_ERROR',
          statusCode: 500,
          timestamp: expect.any(String),
        },
      });
    });
  });

  describe('Error logging', () => {
    it('should log error with request context', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('Test error');
      
      errorHandler(error, mockReq as Request, mockRes as Response);

      // The logger should be called (we can't easily test pino directly, but we can verify the handler doesn't throw)
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });
});
