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
import { config } from '../core/config';
import { acquireLock, releaseLock, LockHandle } from '../utils/lockFile';

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

    // Acquire lock if enabled
    let lockHandle: LockHandle | null = null;
    if (config.LOCKS_ENABLED) {
      try {
        lockHandle = await acquireLock(sku, config.LOCK_TTL_MS, config.LOCK_OWNER_ID);
        logger.debug({ sku, storeId, lockOwner: config.LOCK_OWNER_ID }, 'Lock acquired for stock adjustment');
      } catch (error) {
        logger.warn({ sku, storeId, error }, 'Failed to acquire lock for stock adjustment');
        throw new Error(`Lock acquisition failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    try {
      // Use per-key mutex to serialize writes for this SKU
      const result = await perKeyMutex.acquire(sku, async () => {
        return await this.performStockAdjustmentWithLock(storeId, sku, delta, expectedVersion, key, lockHandle);
      });

      return result;
    } finally {
      // Always release lock if acquired
      if (lockHandle) {
        try {
          await releaseLock(lockHandle);
          logger.debug({ sku, storeId }, 'Lock released for stock adjustment');
        } catch (error) {
          logger.error({ sku, storeId, error }, 'Failed to release lock for stock adjustment');
        }
      }
    }
  }

  /**
   * Perform the actual stock adjustment logic with lock renewal support
   */
  private async performStockAdjustmentWithLock(
    storeId: StoreId,
    sku: SKU,
    delta: number,
    expectedVersion: Version | undefined,
    idempotencyKey: string,
    _lockHandle: LockHandle | null
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

  /**
   * Perform the actual stock adjustment logic (legacy method for compatibility)
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
