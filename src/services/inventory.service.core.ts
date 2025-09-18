import { SKU, StoreId, Version, Quantity } from '../core/types';
import { StockAdjustmentService } from './inventory.service.adjust';
import { StockReservationService } from './inventory.service.reserve';
import { StockAdjustmentResult, StockReservationResult, InventoryService } from './inventory.service.types';

class InventoryServiceImpl implements InventoryService {
  private adjustmentService = new StockAdjustmentService();
  private reservationService = new StockReservationService();

  async adjustStock(
    storeId: StoreId,
    sku: SKU,
    delta: number,
    expectedVersion?: Version,
    idempotencyKey?: string
  ): Promise<StockAdjustmentResult> {
    return this.adjustmentService.adjustStock(storeId, sku, delta, expectedVersion, idempotencyKey);
  }

  async reserveStock(
    storeId: StoreId,
    sku: SKU,
    qty: Quantity,
    expectedVersion?: Version,
    idempotencyKey?: string
  ): Promise<StockReservationResult> {
    return this.reservationService.reserveStock(storeId, sku, qty, expectedVersion, idempotencyKey);
  }
}

// Export singleton instance
export const inventoryService = new InventoryServiceImpl();
