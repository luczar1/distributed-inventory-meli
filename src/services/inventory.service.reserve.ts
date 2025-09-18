import { v4 as uuidv4 } from 'uuid';
import { SKU, StoreId, Version, Quantity } from '../core/types';
import { ConflictError, InsufficientStockError } from '../core/errors';
import { inventoryRepository } from '../repositories/inventory.repo';
import { eventLogRepository, Event } from '../repositories/eventlog.repo';
import { perKeyMutex } from '../utils/perKeyMutex';
import { idempotencyStore } from '../utils/idempotency';
import { logger } from '../core/logger';
import { incrementReserveStock, incrementIdempotentHits, incrementConflicts } from '../utils/metrics';
import { StockReservationResult } from './inventory.service.types';

export class StockReservationService {
  /**
   * Reserve stock (reduce available quantity)
   */
  async reserveStock(
    storeId: StoreId,
    sku: SKU,
    qty: Quantity,
    expectedVersion?: Version,
    idempotencyKey?: string
  ): Promise<StockReservationResult> {
    // Generate idempotency key if not provided
    const key = idempotencyKey || uuidv4();
    
    // Check idempotency first
    const existingResult = await idempotencyStore.get<StockReservationResult>(key);
    if (existingResult) {
      logger.info({ key, sku, storeId }, 'Returning cached result for idempotency key');
      incrementIdempotentHits();
      return existingResult;
    }

    // Use per-key mutex to serialize writes for this SKU
    const result = await perKeyMutex.acquire(sku, async () => {
      return await this.performStockReservation(storeId, sku, qty, expectedVersion, key);
    });

    return result;
  }

  /**
   * Perform the actual stock reservation logic
   */
  private async performStockReservation(
    storeId: StoreId,
    sku: SKU,
    qty: Quantity,
    expectedVersion: Version | undefined,
    idempotencyKey: string
  ): Promise<StockReservationResult> {
    try {
      // Get current record
      const currentRecord = await inventoryRepository.get(sku, storeId);
      
      // Check version if expected version is provided
      if (expectedVersion !== undefined && currentRecord.version !== expectedVersion) {
        incrementConflicts();
        throw ConflictError.versionMismatch(sku, storeId, expectedVersion, currentRecord.version);
      }

      // Check if sufficient stock is available
      if (currentRecord.qty < qty) {
        throw InsufficientStockError.reserve(sku, storeId, qty, currentRecord.qty);
      }

      // Calculate new quantity (reserve = reduce available)
      const newQty = currentRecord.qty - qty;

      // Create updated record
      const updatedRecord = {
        ...currentRecord,
        qty: newQty,
        version: currentRecord.version + 1,
        updatedAt: new Date(),
      };

      // Persist changes
      await inventoryRepository.upsert(updatedRecord);

      // Log event
      const event: Event = {
        id: uuidv4(),
        type: 'stock_reserved',
        payload: {
          sku,
          storeId,
          reservedQty: qty,
          previousQty: currentRecord.qty,
          newQty,
          previousVersion: currentRecord.version,
          newVersion: updatedRecord.version,
        },
        ts: Date.now(),
      };
      await eventLogRepository.append(event);

      const result: StockReservationResult = {
        qty: newQty,
        version: updatedRecord.version,
      };

      // Cache result for idempotency
      await idempotencyStore.set(idempotencyKey, result);

      // Increment metrics
      incrementReserveStock();

      logger.info({ sku, storeId, qty, newQty, version: updatedRecord.version }, 'Stock reserved successfully');
      return result;
    } catch (error) {
      logger.error({ error, sku, storeId, qty }, 'Failed to reserve stock');
      throw error;
    }
  }
}
