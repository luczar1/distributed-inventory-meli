import { describe, it, expect } from 'vitest';
import {
  DomainError,
  ConflictError,
  ValidationError,
  NotFoundError,
} from '../../src/core/errors';

describe('Core Errors - Basic Classes', () => {
  describe('DomainError', () => {
    it('should create domain error with timestamp', () => {
      class TestError extends DomainError {
        readonly code = 'TEST_ERROR';
        readonly statusCode = 400;
      }

      const error = new TestError('Test message');
      expect(error.message).toBe('Test message');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.timestamp).toBeDefined();
      expect(new Date(error.timestamp)).toBeInstanceOf(Date);
    });

    it('should include details in error', () => {
      class TestError extends DomainError {
        readonly code = 'TEST_ERROR';
        readonly statusCode = 400;
      }

      const details = { field: 'test', value: 'invalid' };
      const error = new TestError('Test message', details);
      expect(error.details).toEqual(details);
    });
  });

  describe('ConflictError', () => {
    it('should create conflict error', () => {
      const error = new ConflictError(
        'Version mismatch',
        'SKU123',
        'STORE001',
        1,
        2
      );
      expect(error.code).toBe('CONFLICT_ERROR');
      expect(error.statusCode).toBe(409);
      expect(error.sku).toBe('SKU123');
      expect(error.storeId).toBe('STORE001');
      expect(error.expectedVersion).toBe(1);
      expect(error.actualVersion).toBe(2);
    });

    it('should create version mismatch error', () => {
      const error = ConflictError.versionMismatch(
        'SKU123',
        'STORE001',
        1,
        2
      );
      expect(error.message).toContain('Version mismatch');
      expect(error.message).toContain('SKU123');
      expect(error.message).toContain('STORE001');
      expect(error.message).toContain('Expected: 1');
      expect(error.message).toContain('Actual: 2');
    });
  });

  describe('ValidationError', () => {
    it('should create validation error', () => {
      const error = new ValidationError('Invalid input', 'sku', 'invalid');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.field).toBe('sku');
      expect(error.value).toBe('invalid');
    });

    it('should create invalid SKU error', () => {
      const error = ValidationError.invalidSKU('invalid-sku');
      expect(error.message).toContain('Invalid SKU format');
      expect(error.field).toBe('sku');
      expect(error.value).toBe('invalid-sku');
    });

    it('should create invalid store ID error', () => {
      const error = ValidationError.invalidStoreId('invalid-store');
      expect(error.message).toContain('Invalid store ID format');
      expect(error.field).toBe('storeId');
      expect(error.value).toBe('invalid-store');
    });

    it('should create invalid quantity error', () => {
      const error = ValidationError.invalidQuantity(-1);
      expect(error.message).toContain('Invalid quantity');
      expect(error.field).toBe('quantity');
      expect(error.value).toBe(-1);
    });

    it('should create invalid version error', () => {
      const error = ValidationError.invalidVersion(0);
      expect(error.message).toContain('Invalid version');
      expect(error.field).toBe('version');
      expect(error.value).toBe(0);
    });

    it('should create missing field error', () => {
      const error = ValidationError.missingField('sku');
      expect(error.message).toContain('Missing required field: sku');
      expect(error.field).toBe('sku');
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error', () => {
      const error = new NotFoundError(
        'Resource not found',
        'InventoryRecord',
        'SKU123:STORE001'
      );
      expect(error.code).toBe('NOT_FOUND_ERROR');
      expect(error.statusCode).toBe(404);
      expect(error.resourceType).toBe('InventoryRecord');
      expect(error.identifier).toBe('SKU123:STORE001');
    });

    it('should create inventory record not found error', () => {
      const error = NotFoundError.inventoryRecord('SKU123', 'STORE001');
      expect(error.message).toContain('Inventory record not found');
      expect(error.message).toContain('SKU123');
      expect(error.message).toContain('STORE001');
      expect(error.resourceType).toBe('InventoryRecord');
      expect(error.identifier).toBe('SKU123:STORE001');
    });

    it('should create store not found error', () => {
      const error = NotFoundError.store('STORE001');
      expect(error.message).toContain('Store not found');
      expect(error.message).toContain('STORE001');
      expect(error.resourceType).toBe('Store');
      expect(error.identifier).toBe('STORE001');
    });
  });
});
