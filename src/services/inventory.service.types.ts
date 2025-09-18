import { SKU, StoreId, Version, Quantity } from '../core/types';

// Service result types
export interface StockAdjustmentResult {
  qty: Quantity;
  version: Version;
}

export interface StockReservationResult {
  qty: Quantity;
  version: Version;
}

export interface InventoryService {
  adjustStock(
    storeId: StoreId,
    sku: SKU,
    delta: number,
    expectedVersion?: Version,
    idempotencyKey?: string
  ): Promise<StockAdjustmentResult>;

  reserveStock(
    storeId: StoreId,
    sku: SKU,
    qty: Quantity,
    expectedVersion?: Version,
    idempotencyKey?: string
  ): Promise<StockReservationResult>;
}
