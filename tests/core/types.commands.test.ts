import { describe, it, expect } from 'vitest';
import {
  AdjustStockSchema,
  ReserveStockSchema,
} from '../../src/core/types';

describe('Core Types - Command Schemas', () => {
  describe('AdjustStockSchema', () => {
    it('should validate valid adjust stock', () => {
      const adjust = {
        sku: 'ABC123',
        storeId: 'STORE001',
        delta: 10,
        expectedVersion: 1,
      };
      expect(AdjustStockSchema.parse(adjust)).toEqual(adjust);
    });

    it('should validate without expectedVersion', () => {
      const adjust = {
        sku: 'ABC123',
        storeId: 'STORE001',
        delta: 10,
      };
      expect(AdjustStockSchema.parse(adjust)).toEqual(adjust);
    });
  });

  describe('ReserveStockSchema', () => {
    it('should validate valid reserve stock', () => {
      const reserve = {
        sku: 'ABC123',
        storeId: 'STORE001',
        quantity: 5,
        expectedVersion: 1,
      };
      expect(ReserveStockSchema.parse(reserve)).toEqual(reserve);
    });
  });
});
