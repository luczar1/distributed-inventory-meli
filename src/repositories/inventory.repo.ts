// import { promises as fs } from 'fs'; // Not used in this file
import { join } from 'path';
import { InventoryRecord, SKU, StoreId } from '../core/types';
import { NotFoundError } from '../core/errors';
import { readJsonFile, writeJsonFile, ensureDir } from '../utils/fsSafe';
import { logger } from '../core/logger';

// Per-store inventory state
interface StoreInventory {
  [sku: string]: InventoryRecord;
}

interface InventoryData {
  [storeId: string]: StoreInventory;
}

export class InventoryRepository {
  private readonly dataDir = 'data';
  private readonly filePath: string;

  constructor() {
    this.filePath = join(this.dataDir, 'store-inventory.json');
  }

  /**
   * Get inventory record for a specific SKU in a store
   */
  async get(sku: SKU, storeId: StoreId): Promise<InventoryRecord> {
    try {
      const data = await this.loadData();
      const storeInventory = data[storeId];
      
      if (!storeInventory || !storeInventory[sku]) {
        throw NotFoundError.inventoryRecord(sku, storeId);
      }

      return storeInventory[sku];
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error({ error, sku, storeId }, 'Failed to get inventory record');
      throw new Error(`Failed to get inventory record for SKU ${sku} in store ${storeId}`);
    }
  }

  /**
   * Upsert (insert or update) an inventory record
   */
  async upsert(record: InventoryRecord): Promise<void> {
    try {
      const data = await this.loadData();
      
      if (!data[record.storeId]) {
        data[record.storeId] = {};
      }
      
      data[record.storeId][record.sku] = record;
      
      await this.saveData(data);
      logger.info({ sku: record.sku, storeId: record.storeId, version: record.version }, 'Inventory record upserted');
    } catch (error) {
      logger.error({ error, record }, 'Failed to upsert inventory record');
      throw new Error(`Failed to upsert inventory record for SKU ${record.sku} in store ${record.storeId}`);
    }
  }

  /**
   * List all inventory records for a specific store
   */
  async listByStore(storeId: StoreId): Promise<InventoryRecord[]> {
    try {
      const data = await this.loadData();
      const storeInventory = data[storeId];
      
      if (!storeInventory) {
        return [];
      }

      return Object.values(storeInventory);
    } catch (error) {
      logger.error({ error, storeId }, 'Failed to list inventory by store');
      throw new Error(`Failed to list inventory for store ${storeId}`);
    }
  }

  /**
   * Load inventory data from file
   */
  private async loadData(): Promise<InventoryData> {
    try {
      await ensureDir(this.dataDir);
      const data = await readJsonFile<InventoryData>(this.filePath);
      return data || {};
    } catch (error) {
      logger.warn({ error, filePath: this.filePath }, 'Failed to load inventory data, returning empty data');
      return {};
    }
  }

  /**
   * Save inventory data to file
   */
  private async saveData(data: InventoryData): Promise<void> {
    await ensureDir(this.dataDir);
    await writeJsonFile(this.filePath, data);
  }

  /**
   * Get all stores that have inventory
   */
  async listStores(): Promise<StoreId[]> {
    try {
      const data = await this.loadData();
      return Object.keys(data);
    } catch (error) {
      logger.error({ error }, 'Failed to list stores');
      throw new Error('Failed to list stores');
    }
  }

  /**
   * Delete an inventory record
   */
  async delete(sku: SKU, storeId: StoreId): Promise<void> {
    try {
      const data = await this.loadData();
      const storeInventory = data[storeId];
      
      if (!storeInventory || !storeInventory[sku]) {
        throw NotFoundError.inventoryRecord(sku, storeId);
      }

      delete storeInventory[sku];
      
      // Remove store entry if empty
      if (Object.keys(storeInventory).length === 0) {
        delete data[storeId];
      }
      
      await this.saveData(data);
      logger.info({ sku, storeId }, 'Inventory record deleted');
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error({ error, sku, storeId }, 'Failed to delete inventory record');
      throw new Error(`Failed to delete inventory record for SKU ${sku} in store ${storeId}`);
    }
  }

  /**
   * Get total count of inventory records across all stores
   */
  async getTotalCount(): Promise<number> {
    try {
      const data = await this.loadData();
      let total = 0;
      
      for (const storeInventory of Object.values(data)) {
        total += Object.keys(storeInventory).length;
      }
      
      return total;
    } catch (error) {
      logger.error({ error }, 'Failed to get total count');
      throw new Error('Failed to get total inventory count');
    }
  }
}

// Global instance
export const inventoryRepository = new InventoryRepository();
