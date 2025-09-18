import { join } from 'path';
import { readJsonFile, writeJsonFile, ensureDir } from '../utils/fsSafe';
import { logger } from '../core/logger';
import { CentralInventory } from './sync.worker.types';

export class CentralInventoryManager {
  private readonly dataDir = 'data';
  private readonly centralInventoryPath: string;

  constructor() {
    this.centralInventoryPath = join(this.dataDir, 'central-inventory.json');
  }

  /**
   * Load central inventory
   */
  async loadCentralInventory(): Promise<CentralInventory> {
    try {
      await ensureDir(this.dataDir);
      return await readJsonFile<CentralInventory>(this.centralInventoryPath);
    } catch (error) {
      // File doesn't exist, return empty inventory
      logger.info('Central inventory file not found, starting with empty inventory');
      return {};
    }
  }

  /**
   * Save central inventory
   */
  async saveCentralInventory(inventory: CentralInventory): Promise<void> {
    try {
      await ensureDir(this.dataDir);
      await writeJsonFile(this.centralInventoryPath, inventory);
      logger.debug('Central inventory saved');
    } catch (error) {
      logger.error({ error }, 'Failed to save central inventory');
      throw new Error('Failed to save central inventory');
    }
  }

  /**
   * Update central inventory for a specific SKU and store
   */
  async updateCentralInventory(sku: string, storeId: string, quantity: number): Promise<void> {
    try {
      const inventory = await this.loadCentralInventory();
      
      if (!inventory[sku]) {
        inventory[sku] = {};
      }
      
      inventory[sku][storeId] = quantity;
      
      // Remove store if quantity is 0
      if (quantity === 0) {
        delete inventory[sku][storeId];
      }
      
      // Remove SKU if no stores have inventory
      if (Object.keys(inventory[sku]).length === 0) {
        delete inventory[sku];
      }
      
      await this.saveCentralInventory(inventory);
      logger.debug({ sku, storeId, quantity }, 'Central inventory updated');
    } catch (error) {
      logger.error({ error, sku, storeId, quantity }, 'Failed to update central inventory');
      throw error;
    }
  }

  /**
   * Get central inventory for a specific SKU
   */
  async getCentralInventoryForSku(sku: string): Promise<Record<string, number>> {
    try {
      const inventory = await this.loadCentralInventory();
      return inventory[sku] || {};
    } catch (error) {
      logger.error({ error, sku }, 'Failed to get central inventory for SKU');
      throw error;
    }
  }

  /**
   * Get total quantity for a SKU across all stores
   */
  async getTotalQuantityForSku(sku: string): Promise<number> {
    try {
      const skuInventory = await this.getCentralInventoryForSku(sku);
      return Object.values(skuInventory).reduce((sum, qty) => sum + qty, 0);
    } catch (error) {
      logger.error({ error, sku }, 'Failed to get total quantity for SKU');
      throw error;
    }
  }

  /**
   * Clear central inventory
   */
  async clearCentralInventory(): Promise<void> {
    try {
      await ensureDir(this.dataDir);
      await writeJsonFile(this.centralInventoryPath, {});
      logger.info('Central inventory cleared');
    } catch (error) {
      logger.error({ error }, 'Failed to clear central inventory');
      throw error;
    }
  }

  /**
   * Get central inventory statistics
   */
  async getCentralInventoryStats(): Promise<{
    totalSkus: number;
    totalStores: number;
    totalQuantity: number;
    skusByStore: Record<string, number>;
  }> {
    try {
      const inventory = await this.loadCentralInventory();
      
      const stats = {
        totalSkus: Object.keys(inventory).length,
        totalStores: 0,
        totalQuantity: 0,
        skusByStore: {} as Record<string, number>,
      };

      for (const [, stores] of Object.entries(inventory)) {
        for (const [storeId, quantity] of Object.entries(stores)) {
          stats.totalStores = Math.max(stats.totalStores, Object.keys(stores).length);
          stats.totalQuantity += quantity;
          stats.skusByStore[storeId] = (stats.skusByStore[storeId] || 0) + 1;
        }
      }

      return stats;
    } catch (error) {
      logger.error({ error }, 'Failed to get central inventory statistics');
      throw error;
    }
  }
}
