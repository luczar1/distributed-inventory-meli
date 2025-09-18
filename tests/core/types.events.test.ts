import { describe, it, expect } from 'vitest';
import {
  InventoryEventSchema,
  IdempotencyKeySchema,
} from '../../src/core/types';

describe('Core Types - Event Schemas', () => {
  describe('InventoryEventSchema', () => {
    it('should validate valid inventory event', () => {
      const event = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        type: 'stock_adjusted',
        sku: 'ABC123',
        storeId: 'STORE001',
        quantity: 10,
        version: 1,
        timestamp: new Date(),
        metadata: { source: 'api' },
      };
      expect(InventoryEventSchema.parse(event)).toEqual(event);
    });

    it('should validate without metadata', () => {
      const event = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        type: 'stock_reserved',
        sku: 'ABC123',
        storeId: 'STORE001',
        quantity: 5,
        version: 1,
        timestamp: new Date(),
      };
      expect(InventoryEventSchema.parse(event)).toEqual(event);
    });
  });

  describe('IdempotencyKeySchema', () => {
    it('should validate valid UUID', () => {
      const key = '123e4567-e89b-12d3-a456-426614174000';
      expect(IdempotencyKeySchema.parse(key)).toBe(key);
    });

    it('should reject invalid UUID', () => {
      expect(() => IdempotencyKeySchema.parse('invalid')).toThrow();
      expect(() => IdempotencyKeySchema.parse('123')).toThrow();
    });
  });
});
