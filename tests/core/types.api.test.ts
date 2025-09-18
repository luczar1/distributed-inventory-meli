import { describe, it, expect } from 'vitest';
import {
  CreateInventoryRequestSchema,
  UpdateInventoryRequestSchema,
  ReserveInventoryRequestSchema,
  ReleaseInventoryRequestSchema,
  GetInventoryRequestSchema,
} from '../../src/core/types';

describe('Core Types - API Request Schemas', () => {
  it('should validate CreateInventoryRequest', () => {
    const request = {
      sku: 'ABC123',
      storeId: 'STORE001',
      initialQuantity: 100,
    };
    expect(CreateInventoryRequestSchema.parse(request)).toEqual(request);
  });

  it('should validate UpdateInventoryRequest', () => {
    const request = {
      sku: 'ABC123',
      storeId: 'STORE001',
      delta: 10,
      expectedVersion: 1,
    };
    expect(UpdateInventoryRequestSchema.parse(request)).toEqual(request);
  });

  it('should validate ReserveInventoryRequest', () => {
    const request = {
      sku: 'ABC123',
      storeId: 'STORE001',
      quantity: 5,
      expectedVersion: 1,
    };
    expect(ReserveInventoryRequestSchema.parse(request)).toEqual(request);
  });

  it('should validate ReleaseInventoryRequest', () => {
    const request = {
      sku: 'ABC123',
      storeId: 'STORE001',
      quantity: 5,
      expectedVersion: 1,
    };
    expect(ReleaseInventoryRequestSchema.parse(request)).toEqual(request);
  });

  it('should validate GetInventoryRequest', () => {
    const request = {
      sku: 'ABC123',
      storeId: 'STORE001',
    };
    expect(GetInventoryRequestSchema.parse(request)).toEqual(request);
  });
});
