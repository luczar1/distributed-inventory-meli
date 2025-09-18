/**
 * Inventory Service
 * Core business logic for inventory management with concurrency control
 */
const InventoryItem = require('../models/InventoryItem');
const InventoryOperation = require('../models/InventoryOperation');
const ConcurrencyControl = require('./ConcurrencyControl');
const PersistenceService = require('./PersistenceService');
const logger = require('../utils/logger');

class InventoryService {
  constructor(storeId = 'default') {
    this.storeId = storeId;
    this.concurrencyControl = new ConcurrencyControl();
    this.persistence = new PersistenceService();
    this.operations = new Map(); // Track operations by idempotency key
  }

  /**
   * Add inventory item
   * @param {string} sku - SKU identifier
   * @param {string} name - Item name
   * @param {number} quantity - Initial quantity
   * @param {string} idempotencyKey - Idempotency key
   * @returns {Promise<Object>}
   */
  async addItem(sku, name, quantity, idempotencyKey = null) {
    const operation = new InventoryOperation('add', sku, quantity, idempotencyKey);
    
    if (idempotencyKey && this.operations.has(idempotencyKey)) {
      const existingOp = this.operations.get(idempotencyKey);
      if (existingOp.status === 'completed') {
        return { success: true, operation: existingOp, message: 'Operation already completed' };
      }
    }

    try {
      const result = await this.concurrencyControl.executeWithMutex(sku, async () => {
        const items = await this.loadInventory();
        let item = items[sku];

        if (item) {
          item.add(quantity);
        } else {
          item = new InventoryItem(sku, name, quantity);
        }

        items[sku] = item;
        await this.saveInventory(items);
        
        operation.complete();
        this.operations.set(operation.idempotencyKey, operation);
        
        logger.info(`Added ${quantity} units of ${sku} to inventory`);
        return { success: true, item: item.toJSON(), operation };
      });

      return result;
    } catch (error) {
      operation.fail(error.message);
      this.operations.set(operation.idempotencyKey, operation);
      logger.error(`Failed to add item ${sku}:`, error);
      throw error;
    }
  }

  /**
   * Remove inventory item
   * @param {string} sku - SKU identifier
   * @param {number} quantity - Quantity to remove
   * @param {string} idempotencyKey - Idempotency key
   * @returns {Promise<Object>}
   */
  async removeItem(sku, quantity, idempotencyKey = null) {
    const operation = new InventoryOperation('remove', sku, quantity, idempotencyKey);
    
    if (idempotencyKey && this.operations.has(idempotencyKey)) {
      const existingOp = this.operations.get(idempotencyKey);
      if (existingOp.status === 'completed') {
        return { success: true, operation: existingOp, message: 'Operation already completed' };
      }
    }

    try {
      const result = await this.concurrencyControl.executeWithMutex(sku, async () => {
        const items = await this.loadInventory();
        const item = items[sku];

        if (!item) {
          throw new Error(`Item ${sku} not found`);
        }

        if (!item.remove(quantity)) {
          throw new Error(`Insufficient quantity for ${sku}. Available: ${item.available}`);
        }

        await this.saveInventory(items);
        
        operation.complete();
        this.operations.set(operation.idempotencyKey, operation);
        
        logger.info(`Removed ${quantity} units of ${sku} from inventory`);
        return { success: true, item: item.toJSON(), operation };
      });

      return result;
    } catch (error) {
      operation.fail(error.message);
      this.operations.set(operation.idempotencyKey, operation);
      logger.error(`Failed to remove item ${sku}:`, error);
      throw error;
    }
  }

  /**
   * Reserve inventory
   * @param {string} sku - SKU identifier
   * @param {number} quantity - Quantity to reserve
   * @param {string} idempotencyKey - Idempotency key
   * @returns {Promise<Object>}
   */
  async reserveItem(sku, quantity, idempotencyKey = null) {
    const operation = new InventoryOperation('reserve', sku, quantity, idempotencyKey);
    
    if (idempotencyKey && this.operations.has(idempotencyKey)) {
      const existingOp = this.operations.get(idempotencyKey);
      if (existingOp.status === 'completed') {
        return { success: true, operation: existingOp, message: 'Operation already completed' };
      }
    }

    try {
      const result = await this.concurrencyControl.executeWithMutex(sku, async () => {
        const items = await this.loadInventory();
        const item = items[sku];

        if (!item) {
          throw new Error(`Item ${sku} not found`);
        }

        if (!item.reserve(quantity)) {
          throw new Error(`Insufficient available quantity for ${sku}. Available: ${item.available}`);
        }

        await this.saveInventory(items);
        
        operation.complete();
        this.operations.set(operation.idempotencyKey, operation);
        
        logger.info(`Reserved ${quantity} units of ${sku}`);
        return { success: true, item: item.toJSON(), operation };
      });

      return result;
    } catch (error) {
      operation.fail(error.message);
      this.operations.set(operation.idempotencyKey, operation);
      logger.error(`Failed to reserve item ${sku}:`, error);
      throw error;
    }
  }

  /**
   * Release reserved inventory
   * @param {string} sku - SKU identifier
   * @param {number} quantity - Quantity to release
   * @param {string} idempotencyKey - Idempotency key
   * @returns {Promise<Object>}
   */
  async releaseItem(sku, quantity, idempotencyKey = null) {
    const operation = new InventoryOperation('release', sku, quantity, idempotencyKey);
    
    if (idempotencyKey && this.operations.has(idempotencyKey)) {
      const existingOp = this.operations.get(idempotencyKey);
      if (existingOp.status === 'completed') {
        return { success: true, operation: existingOp, message: 'Operation already completed' };
      }
    }

    try {
      const result = await this.concurrencyControl.executeWithMutex(sku, async () => {
        const items = await this.loadInventory();
        const item = items[sku];

        if (!item) {
          throw new Error(`Item ${sku} not found`);
        }

        if (!item.release(quantity)) {
          throw new Error(`Insufficient reserved quantity for ${sku}. Reserved: ${item.reserved}`);
        }

        await this.saveInventory(items);
        
        operation.complete();
        this.operations.set(operation.idempotencyKey, operation);
        
        logger.info(`Released ${quantity} units of ${sku}`);
        return { success: true, item: item.toJSON(), operation };
      });

      return result;
    } catch (error) {
      operation.fail(error.message);
      this.operations.set(operation.idempotencyKey, operation);
      logger.error(`Failed to release item ${sku}:`, error);
      throw error;
    }
  }

  /**
   * Get inventory item
   * @param {string} sku - SKU identifier
   * @returns {Promise<Object>}
   */
  async getItem(sku) {
    const items = await this.loadInventory();
    const item = items[sku];
    
    if (!item) {
      throw new Error(`Item ${sku} not found`);
    }
    
    return item.toJSON();
  }

  /**
   * Get all inventory items
   * @returns {Promise<Object>}
   */
  async getAllItems() {
    const items = await this.loadInventory();
    const result = {};
    
    for (const [sku, item] of Object.entries(items)) {
      result[sku] = item.toJSON();
    }
    
    return result;
  }

  /**
   * Load inventory from persistence
   * @returns {Promise<Object>}
   */
  async loadInventory() {
    const filename = `inventory_${this.storeId}.json`;
    const data = await this.persistence.readFile(filename, {});
    
    const items = {};
    for (const [sku, itemData] of Object.entries(data)) {
      items[sku] = InventoryItem.fromJSON(itemData);
    }
    
    return items;
  }

  /**
   * Save inventory to persistence
   * @param {Object} items - Inventory items
   * @returns {Promise<void>}
   */
  async saveInventory(items) {
    const filename = `inventory_${this.storeId}.json`;
    const data = {};
    
    for (const [sku, item] of Object.entries(items)) {
      data[sku] = item.toJSON();
    }
    
    await this.persistence.writeFile(filename, data);
  }

  /**
   * Get operation by idempotency key
   * @param {string} idempotencyKey - Idempotency key
   * @returns {Object|null}
   */
  getOperation(idempotencyKey) {
    return this.operations.get(idempotencyKey) || null;
  }

  /**
   * Get service statistics
   * @returns {Object}
   */
  getStats() {
    return {
      storeId: this.storeId,
      operationsCount: this.operations.size,
      concurrencyStats: this.concurrencyControl.getStats()
    };
  }
}

module.exports = InventoryService;
