import { InventoryRecord } from '../core/types';

// Central inventory state structure
export interface CentralInventory {
  [storeId: string]: {
    [sku: string]: InventoryRecord;
  };
}

// Sync worker state
export interface SyncState {
  lastProcessedEventId?: string;
  isRunning: boolean;
  intervalId?: NodeJS.Timeout;
}
