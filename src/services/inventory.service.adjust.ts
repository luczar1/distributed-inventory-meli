import { v4 as uuidv4 } from 'uuid';
import { SKU, StoreId, Version } from '../core/types';
import { ConflictError, InsufficientStockError } from '../core/errors';
import { inventoryRepository } from '../repositories/inventory.repo';
import { eventLogRepository, Event } from '../repositories/eventlog.repo';
import { perKeyMutex } from '../utils/perKeyMutex';
import { idempotencyStore } from '../utils/idempotency';
import { logger } from '../core/logger';
import { incrementAdjustStock, incrementIdempotentHits, incrementConflicts } from '../utils/metrics';
import { StockAdjustmentResult } from './inventory.service.types';

export class StockAdjustmentService {
  /**
   * Adjust stock by a delta amount (positive or negative)
   */
  async adjustStock(
    storeId: StoreId,
    sku: SKU,
    delta: number,
    expectedVersion?: Version,
    idempotencyKey?: string
  ): Promise<StockAdjustmentResult> {
    // Generate idempotency key if not provided
    const key = idempotencyKey || uuidv4();
    
    // Check idempotency first
    const existingResult = await idempotencyStore.get<StockAdjustmentResult>(key);
    if (existingResult) {
      logger.info({ key, sku, storeId }, 'Returning cached result for idempotency key');
      incrementIdempotentHits();
      return existingResult;
    }

    // Use per-key mutex to serialize writes for this SKU
    const result = await perKeyMutex.acquire(sku, async () => {
      return await this.performStockAdjustment(storeId, sku, delta, expectedVersion, key);
    });

    return result;
  }

  /**
   * Perform the actual stock adjustment logic
   */
  private async performStockAdjustment(
    storeId: StoreId,
    sku: SKU,
    delta: number,
    expectedVersion: Version | undefined,
    idempotencyKey: string
  ): Promise<StockAdjustmentResult> {
    try {
      // Get current record
      const currentRecord = await inventoryRepository.get(sku, storeId);
      
      // Check version if expected version is provided
      if (expectedVersion !== undefined && currentRecord.version !== expectedVersion) {
        incrementConflicts();
        throw ConflictError.versionMismatch(sku, storeId, expectedVersion, currentRecord.version);
      }

      // Calculate new quantity
      const newQty = currentRecord.qty + delta;
      if (newQty < 0) {
        throw InsufficientStockError.reserve(sku, storeId, Math.abs(delta), currentRecord.qty);
      }

      // Create updated record
      const updatedRecord = {
        ...currentRecord,
        qty: newQty,
        version: currentRecord.version + 1,
        updatedAt: new Date(),
      };

      // OUTBOX PATTERN: Log event FIRST, then persist state
      const event: Event = {
        id: uuidv4(),
        type: 'stock_adjusted',
        payload: {
          sku,
          storeId,
          delta,
          previousQty: currentRecord.qty,
          newQty,
          previousVersion: currentRecord.version,
          newVersion: updatedRecord.version,
        },
        ts: Date.now(),
        sequence: 0, // Will be assigned by event log
      };
      await eventLogRepository.append(event);

      // Persist changes AFTER event is logged
      await inventoryRepository.upsert(updatedRecord);

      const result: StockAdjustmentResult = {
        qty: newQty,
        version: updatedRecord.version,
      };

      // Cache result for idempotency
      await idempotencyStore.set(idempotencyKey, result);

      // Increment metrics
      incrementAdjustStock();

      logger.info({ sku, storeId, delta, newQty, version: updatedRecord.version }, 'Stock adjusted successfully');
      return result;
    } catch (error) {
      logger.error({ error, sku, storeId, delta }, 'Failed to adjust stock');
      throw error;
    }
  }
}
