import { describe, it, expect } from 'vitest';
import {
  SKUSchema,
  StoreIdSchema,
  VersionSchema,
  QuantitySchema,
  InventoryRecordSchema,
} from '../../src/core/types';

describe('Core Types - Basic Schemas', () => {
  describe('SKUSchema', () => {
    it('should validate valid SKU', () => {
      expect(SKUSchema.parse('ABC123')).toBe('ABC123');
      expect(SKUSchema.parse('PRODUCT-001')).toBe('PRODUCT-001');
    });

    it('should reject invalid SKU', () => {
      expect(() => SKUSchema.parse('')).toThrow();
      expect(() => SKUSchema.parse('a'.repeat(51))).toThrow();
      expect(() => SKUSchema.parse(null)).toThrow();
      expect(() => SKUSchema.parse(undefined)).toThrow();
    });
  });

  describe('StoreIdSchema', () => {
    it('should validate valid store ID', () => {
      expect(StoreIdSchema.parse('STORE001')).toBe('STORE001');
      expect(StoreIdSchema.parse('NYC-001')).toBe('NYC-001');
    });

    it('should reject invalid store ID', () => {
      expect(() => StoreIdSchema.parse('')).toThrow();
      expect(() => StoreIdSchema.parse('a'.repeat(21))).toThrow();
    });
  });

  describe('VersionSchema', () => {
    it('should validate valid version', () => {
      expect(VersionSchema.parse(1)).toBe(1);
      expect(VersionSchema.parse(100)).toBe(100);
    });

    it('should reject invalid version', () => {
      expect(() => VersionSchema.parse(0)).toThrow();
      expect(() => VersionSchema.parse(-1)).toThrow();
      expect(() => VersionSchema.parse(1.5)).toThrow();
    });
  });

  describe('QuantitySchema', () => {
    it('should validate valid quantity', () => {
      expect(QuantitySchema.parse(0)).toBe(0);
      expect(QuantitySchema.parse(100)).toBe(100);
    });

    it('should reject invalid quantity', () => {
      expect(() => QuantitySchema.parse(-1)).toThrow();
      expect(() => QuantitySchema.parse(1.5)).toThrow();
    });
  });

  describe('InventoryRecordSchema', () => {
    it('should validate valid inventory record', () => {
      const record = {
        sku: 'ABC123',
        storeId: 'STORE001',
        qty: 100,
        version: 1,
        updatedAt: new Date(),
      };
      expect(InventoryRecordSchema.parse(record)).toEqual(record);
    });

    it('should reject invalid inventory record', () => {
      expect(() => InventoryRecordSchema.parse({})).toThrow();
      expect(() => InventoryRecordSchema.parse({
        sku: 'ABC123',
        storeId: 'STORE001',
        qty: -1,
        version: 1,
        updatedAt: new Date(),
      })).toThrow();
    });
  });
});
