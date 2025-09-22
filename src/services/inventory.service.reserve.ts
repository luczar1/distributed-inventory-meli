import { v4 as uuidv4 } from 'uuid';
import { SKU, StoreId, Version, Quantity } from '../core/types';
import { ConflictError, InsufficientStockError, LockRejectionError } from '../core/errors';
import { inventoryRepository } from '../repositories/inventory.repo';
import { eventLogRepository, Event } from '../repositories/eventlog.repo';
import { perKeyMutex } from '../utils/perKeyMutex';
import { idempotencyStore } from '../utils/idempotency';
import { logger } from '../core/logger';
import { incrementReserveStock, incrementIdempotentHits, incrementConflicts } from '../utils/metrics';
import { StockReservationResult } from './inventory.service.types';
import { config } from '../core/config';
import { acquireLock, releaseLock, LockHandle } from '../utils/lockFile';

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

    // Acquire lock if enabled
    let lockHandle: LockHandle | null = null;
    if (config.LOCKS_ENABLED) {
      try {
        lockHandle = await acquireLock(sku, config.LOCK_TTL_MS, config.LOCK_OWNER_ID);
        logger.debug({ sku, storeId, lockOwner: config.LOCK_OWNER_ID }, 'Lock acquired for stock reservation');
      } catch (error) {
        logger.warn({ sku, storeId, error }, 'Failed to acquire lock for stock reservation');
        throw new LockRejectionError(sku, config.LOCK_RETRY_AFTER_MS / 1000, `Lock acquisition failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    try {
      // Use per-key mutex to serialize writes for this SKU
      const result = await perKeyMutex.acquire(sku, async () => {
        return await this.performStockReservationWithLock(storeId, sku, qty, expectedVersion, key, lockHandle);
      });

      return result;
    } finally {
      // Always release lock if acquired
      if (lockHandle) {
        try {
          await releaseLock(lockHandle);
          logger.debug({ sku, storeId }, 'Lock released for stock reservation');
        } catch (error) {
          logger.error({ sku, storeId, error }, 'Failed to release lock for stock reservation');
        }
      }
    }
  }

  /**
   * Perform the actual stock reservation logic with lock renewal support
   */
  private async performStockReservationWithLock(
    storeId: StoreId,
    sku: SKU,
    qty: Quantity,
    expectedVersion: Version | undefined,
    idempotencyKey: string,
    _lockHandle?: LockHandle | null
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

      // OUTBOX PATTERN: Log event FIRST, then persist state
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
        sequence: 0, // Will be assigned by event log
      };
      await eventLogRepository.append(event);

      // Persist changes AFTER event is logged
      await inventoryRepository.upsert(updatedRecord);

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

  /**
   * Perform the actual stock reservation logic (legacy method for compatibility)
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

      // OUTBOX PATTERN: Log event FIRST, then persist state
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
        sequence: 0, // Will be assigned by event log
      };
      await eventLogRepository.append(event);

      // Persist changes AFTER event is logged
      await inventoryRepository.upsert(updatedRecord);

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
