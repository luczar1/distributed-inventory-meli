import { describe, it, expect } from 'vitest';
import {
  ValidationError,
  IdempotencyConflictError,
  InsufficientStockError,
  ErrorFactory,
} from '../../src/core/errors';

describe('Core Errors - Specialized Classes', () => {
  describe('IdempotencyConflictError', () => {
    it('should create idempotency conflict error', () => {
      const error = new IdempotencyConflictError(
        'Duplicate operation',
        'key123',
        'previous-operation'
      );
      expect(error.code).toBe('IDEMPOTENCY_CONFLICT_ERROR');
      expect(error.statusCode).toBe(409);
      expect(error.idempotencyKey).toBe('key123');
      expect(error.existingOperation).toBe('previous-operation');
    });

    it('should create duplicate operation error', () => {
      const error = IdempotencyConflictError.duplicateOperation(
        'key123',
        'previous-operation'
      );
      expect(error.message).toContain('Operation with idempotency key key123');
      expect(error.message).toContain('already exists');
      expect(error.idempotencyKey).toBe('key123');
      expect(error.existingOperation).toBe('previous-operation');
    });
  });

  describe('InsufficientStockError', () => {
    it('should create insufficient stock error', () => {
      const error = new InsufficientStockError(
        'Not enough stock',
        'SKU123',
        'STORE001',
        10,
        5
      );
      expect(error.code).toBe('INSUFFICIENT_STOCK_ERROR');
      expect(error.statusCode).toBe(422);
      expect(error.sku).toBe('SKU123');
      expect(error.storeId).toBe('STORE001');
      expect(error.requested).toBe(10);
      expect(error.available).toBe(5);
    });

    it('should create reserve error', () => {
      const error = InsufficientStockError.reserve('SKU123', 'STORE001', 10, 5);
      expect(error.message).toContain('Insufficient stock to reserve');
      expect(error.message).toContain('10 units of SKU123');
      expect(error.message).toContain('Available: 5');
    });
  });

  describe('ErrorFactory', () => {
    it('should create error response', () => {
      const error = new ValidationError('Test error', 'field', 'value');
      const response = ErrorFactory.createErrorResponse(error);
      
      expect(response.success).toBe(false);
      expect(response.error.name).toBe('ValidationError');
      expect(response.error.message).toBe('Test error');
      expect(response.error.code).toBe('VALIDATION_ERROR');
      expect(response.error.statusCode).toBe(400);
      expect(response.error.timestamp).toBe(error.timestamp);
      expect(response.error.details).toEqual({ field: 'field', value: 'value' });
    });
  });
});
