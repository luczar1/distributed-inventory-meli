import { Event } from '../repositories/eventlog.repo';
import { InventoryRecord } from '../core/types';
import { logger } from '../core/logger';

export class EventProcessor {
  /**
   * Process a single event
   */
  async processEvent(event: Event, inventoryManager: any): Promise<void> {
    const { sku, storeId } = event.payload as { sku: string; storeId: string };
    
    if (event.type === 'stock_adjusted') {
      const { newQty, newVersion } = event.payload as { newQty: number; newVersion: number };
      await inventoryManager.updateCentralInventory(storeId, sku, {
        sku,
        storeId,
        qty: newQty,
        version: newVersion,
      });
    } else if (event.type === 'stock_reserved') {
      const { newQty, newVersion } = event.payload as { newQty: number; newVersion: number };
      await inventoryManager.updateCentralInventory(storeId, sku, {
        sku,
        storeId,
        qty: newQty,
        version: newVersion,
      });
    }
    
    logger.debug({ eventId: event.id, type: event.type, sku, storeId }, 'Event processed');
  }

  /**
   * Get events that haven't been processed yet
   */
  getNewEvents(events: Event[], lastProcessedEventId?: string): Event[] {
    if (!lastProcessedEventId) {
      return events;
    }

    const lastProcessedIndex = events.findIndex(e => e.id === lastProcessedEventId);
    if (lastProcessedIndex === -1) {
      // Last processed event not found, process all events
      return events;
    }

    return events.slice(lastProcessedIndex + 1);
  }

  /**
   * Apply a single event to central inventory
   */
  async applyEventToCentral(centralInventory: Record<string, unknown>, event: Event): Promise<void> {
    const { sku, storeId } = event.payload as { sku: string; storeId: string };

    if (!centralInventory[storeId]) {
      centralInventory[storeId] = {};
    }

    if (!centralInventory[storeId][sku]) {
      // Initialize inventory record if it doesn't exist
      centralInventory[storeId][sku] = {
        sku,
        storeId,
        qty: 0,
        version: 0,
        updatedAt: new Date(event.ts),
      };
    }

    const currentRecord = centralInventory[storeId][sku];

    // Apply event based on type
    switch (event.type) {
      case 'stock_adjusted':
        await this.applyStockAdjustment(currentRecord, event);
        break;
      case 'stock_reserved':
        await this.applyStockReservation(currentRecord, event);
        break;
      default:
        logger.warn({ eventType: event.type }, 'Unknown event type, skipping');
    }
  }

  /**
   * Apply stock adjustment event
   */
  private async applyStockAdjustment(record: InventoryRecord, event: Event): Promise<void> {
    const { delta, newQty, newVersion } = event.payload as {
      delta: number;
      newQty: number;
      newVersion: number;
    };

    record.qty = newQty;
    record.version = newVersion;
    record.updatedAt = new Date(event.ts);

    logger.debug({ sku: record.sku, storeId: record.storeId, delta, newQty }, 'Applied stock adjustment');
  }

  /**
   * Apply stock reservation event
   */
  private async applyStockReservation(record: InventoryRecord, event: Event): Promise<void> {
    const { newQty, newVersion } = event.payload as {
      newQty: number;
      newVersion: number;
    };

    record.qty = newQty;
    record.version = newVersion;
    record.updatedAt = new Date(event.ts);

    logger.debug({ sku: record.sku, storeId: record.storeId, newQty }, 'Applied stock reservation');
  }
}
