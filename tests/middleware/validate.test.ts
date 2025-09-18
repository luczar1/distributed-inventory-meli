import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validateBody, validateParams, validateQuery } from '../../src/middleware/validate';
import { ValidationError } from '../../src/core/errors';

describe('Validation Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      body: {},
      params: {},
      query: {},
    };
    mockRes = {};
    mockNext = vi.fn();
  });

  describe('validateBody', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });

    it('should validate valid body', () => {
      mockReq.body = { name: 'John', age: 30 };
      const middleware = validateBody(schema);

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.body).toEqual({ name: 'John', age: 30 });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should throw ValidationError for invalid body', () => {
      mockReq.body = { name: 'John', age: 'invalid' };
      const middleware = validateBody(schema);

      expect(() => {
        middleware(mockReq as Request, mockRes as Response, mockNext);
      }).toThrow(ValidationError);
    });

    it('should throw ValidationError for missing fields', () => {
      mockReq.body = { name: 'John' };
      const middleware = validateBody(schema);

      expect(() => {
        middleware(mockReq as Request, mockRes as Response, mockNext);
      }).toThrow(ValidationError);
    });

    it('should pass through non-ZodError', () => {
      const error = new Error('Non-Zod error');
      const middleware = validateBody(schema);
      
      // Mock schema.parse to throw non-ZodError
      vi.spyOn(schema, 'parse').mockImplementation(() => {
        throw error;
      });

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('validateParams', () => {
    const schema = z.object({
      id: z.string(),
      type: z.string(),
    });

    it('should validate valid params', () => {
      mockReq.params = { id: '123', type: 'user' };
      const middleware = validateParams(schema);

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.params).toEqual({ id: '123', type: 'user' });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should throw ValidationError for invalid params', () => {
      mockReq.params = { id: 123, type: 'user' };
      const middleware = validateParams(schema);

      expect(() => {
        middleware(mockReq as Request, mockRes as Response, mockNext);
      }).toThrow(ValidationError);
    });

    it('should pass through non-ZodError', () => {
      const error = new Error('Non-Zod error');
      const middleware = validateParams(schema);
      
      vi.spyOn(schema, 'parse').mockImplementation(() => {
        throw error;
      });

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('validateQuery', () => {
    const schema = z.object({
      page: z.string().optional(),
      limit: z.string().optional(),
    });

    it('should validate valid query', () => {
      mockReq.query = { page: '1', limit: '10' };
      const middleware = validateQuery(schema);

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.query).toEqual({ page: '1', limit: '10' });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should validate empty query', () => {
      mockReq.query = {};
      const middleware = validateQuery(schema);

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.query).toEqual({});
      expect(mockNext).toHaveBeenCalled();
    });

    it('should call next with ValidationError for invalid query', () => {
      mockReq.query = { page: 'invalid', limit: '10' };
      const middleware = validateQuery(schema);

      // Mock the schema to throw a ZodError
      vi.spyOn(schema, 'parse').mockImplementation(() => {
        const zodError = new z.ZodError([
          {
            code: 'invalid_type',
            expected: 'number',
            received: 'string',
            path: ['page'],
            message: 'Expected number, received string',
          },
        ]);
        throw zodError;
      });

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
    });

    it('should pass through non-ZodError', () => {
      const error = new Error('Non-Zod error');
      const middleware = validateQuery(schema);
      
      vi.spyOn(schema, 'parse').mockImplementation(() => {
        throw error;
      });

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('ValidationError details', () => {
    it('should include field errors in ValidationError', () => {
      const schema = z.object({
        name: z.string().min(3),
        age: z.number().min(18),
      });

      mockReq.body = { name: 'Jo', age: 15 };
      const middleware = validateBody(schema);

      expect(() => {
        middleware(mockReq as Request, mockRes as Response, mockNext);
      }).toThrow(ValidationError);
    });
  });
});
