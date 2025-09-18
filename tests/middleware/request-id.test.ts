import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { requestIdMiddleware } from '../../src/middleware/request-id';

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid-123'),
}));

describe('Request ID Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      headers: {},
    };
    mockRes = {
      setHeader: vi.fn(),
    };
    mockNext = vi.fn();
  });

  it('should generate UUID when no x-request-id header', () => {
    requestIdMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockReq.id).toBe('mock-uuid-123');
    expect(mockRes.setHeader).toHaveBeenCalledWith('x-request-id', 'mock-uuid-123');
    expect(mockNext).toHaveBeenCalled();
  });

  it('should use existing x-request-id header', () => {
    mockReq.headers = { 'x-request-id': 'existing-id-456' };

    requestIdMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockReq.id).toBe('existing-id-456');
    expect(mockRes.setHeader).toHaveBeenCalledWith('x-request-id', 'existing-id-456');
    expect(mockNext).toHaveBeenCalled();
  });

    it('should handle case-insensitive header', () => {
      mockReq.headers = { 'x-request-id': 'uppercase-id-789' };

      requestIdMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.id).toBe('uppercase-id-789');
      expect(mockRes.setHeader).toHaveBeenCalledWith('x-request-id', 'uppercase-id-789');
      expect(mockNext).toHaveBeenCalled();
    });

  it('should generate new UUID for empty header', () => {
    mockReq.headers = { 'x-request-id': '' };

    requestIdMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockReq.id).toBe('mock-uuid-123');
    expect(mockRes.setHeader).toHaveBeenCalledWith('x-request-id', 'mock-uuid-123');
    expect(mockNext).toHaveBeenCalled();
  });

  it('should generate new UUID for undefined header', () => {
    mockReq.headers = { 'x-request-id': undefined };

    requestIdMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockReq.id).toBe('mock-uuid-123');
    expect(mockRes.setHeader).toHaveBeenCalledWith('x-request-id', 'mock-uuid-123');
    expect(mockNext).toHaveBeenCalled();
  });
});
