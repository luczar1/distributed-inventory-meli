import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { ifMatchMiddleware } from '../../src/middleware/versionPrecondition';
import { ConflictError } from '../../src/core/errors';

// Mock the logger
vi.mock('../../src/core/logger', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('ifMatchMiddleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      headers: {},
    };
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    mockNext = vi.fn();
  });

  it('should parse valid If-Match header with version number', () => {
    mockRequest.headers!['if-match'] = '"123"';
    
    ifMatchMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
    
    expect((mockRequest as any).ifMatchVersion).toBe(123);
    expect(mockNext).toHaveBeenCalledWith();
  });

  it('should parse valid If-Match header with W/ prefix', () => {
    mockRequest.headers!['if-match'] = 'W/"456"';
    
    ifMatchMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
    
    expect((mockRequest as any).ifMatchVersion).toBe(456);
    expect(mockNext).toHaveBeenCalledWith();
  });

  it('should handle missing If-Match header', () => {
    ifMatchMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
    
    expect((mockRequest as any).ifMatchVersion).toBeUndefined();
    expect(mockNext).toHaveBeenCalledWith();
  });

  it('should handle invalid If-Match header format', () => {
    mockRequest.headers!['if-match'] = 'invalid-format';
    
    ifMatchMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
    
    expect((mockRequest as any).ifMatchVersion).toBeUndefined();
    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: {
        name: 'BadRequestError',
        message: 'Invalid If-Match header format',
        code: 'INVALID_IF_MATCH',
        statusCode: 400,
        timestamp: expect.any(String),
      },
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should handle empty If-Match header', () => {
    mockRequest.headers!['if-match'] = '';
    
    ifMatchMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
    
    expect((mockRequest as any).ifMatchVersion).toBeUndefined();
    expect(mockNext).toHaveBeenCalledWith();
  });

  it('should handle non-numeric version in If-Match header', () => {
    mockRequest.headers!['if-match'] = '"abc"';
    
    ifMatchMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
    
    expect((mockRequest as any).ifMatchVersion).toBeUndefined();
    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: {
        name: 'BadRequestError',
        message: 'Invalid If-Match header format',
        code: 'INVALID_IF_MATCH',
        statusCode: 400,
        timestamp: expect.any(String),
      },
    });
    expect(mockNext).not.toHaveBeenCalled();
  });
});
