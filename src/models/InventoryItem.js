/**
 * Inventory Item Model
 * Represents a single inventory item with optimistic concurrency control
 */
class InventoryItem {
  constructor(sku, name, quantity = 0, reserved = 0, version = 1) {
    this.sku = sku;
    this.name = name;
    this.quantity = Math.max(0, quantity);
    this.reserved = Math.max(0, reserved);
    this.version = version;
    this.lastUpdated = new Date().toISOString();
    this.createdAt = new Date().toISOString();
  }

  /**
   * Get available quantity (total - reserved)
   */
  get available() {
    return Math.max(0, this.quantity - this.reserved);
  }

  /**
   * Reserve quantity if available
   * @param {number} amount - Amount to reserve
   * @returns {boolean} - Success status
   */
  reserve(amount) {
    if (amount <= 0 || amount > this.available) {
      return false;
    }
    this.reserved += amount;
    this.lastUpdated = new Date().toISOString();
    return true;
  }

  /**
   * Release reserved quantity
   * @param {number} amount - Amount to release
   * @returns {boolean} - Success status
   */
  release(amount) {
    if (amount <= 0 || amount > this.reserved) {
      return false;
    }
    this.reserved -= amount;
    this.lastUpdated = new Date().toISOString();
    return true;
  }

  /**
   * Add to inventory
   * @param {number} amount - Amount to add
   */
  add(amount) {
    if (amount > 0) {
      this.quantity += amount;
      this.version++;
      this.lastUpdated = new Date().toISOString();
    }
  }

  /**
   * Remove from inventory (only unreserved quantity)
   * @param {number} amount - Amount to remove
   * @returns {boolean} - Success status
   */
  remove(amount) {
    if (amount <= 0 || amount > this.available) {
      return false;
    }
    this.quantity -= amount;
    this.version++;
    this.lastUpdated = new Date().toISOString();
    return true;
  }

  /**
   * Convert to JSON representation
   */
  toJSON() {
    return {
      sku: this.sku,
      name: this.name,
      quantity: this.quantity,
      reserved: this.reserved,
      available: this.available,
      version: this.version,
      lastUpdated: this.lastUpdated,
      createdAt: this.createdAt
    };
  }

  /**
   * Create from JSON data
   * @param {Object} data - JSON data
   * @returns {InventoryItem}
   */
  static fromJSON(data) {
    const item = new InventoryItem(
      data.sku,
      data.name,
      data.quantity,
      data.reserved,
      data.version
    );
    item.lastUpdated = data.lastUpdated || item.lastUpdated;
    item.createdAt = data.createdAt || item.createdAt;
    return item;
  }

  /**
   * Validate item data
   * @param {Object} data - Item data to validate
   * @returns {Object} - Validation result
   */
  static validate(data) {
    const errors = [];
    
    if (!data.sku || typeof data.sku !== 'string') {
      errors.push('SKU is required and must be a string');
    }
    
    if (!data.name || typeof data.name !== 'string') {
      errors.push('Name is required and must be a string');
    }
    
    if (typeof data.quantity !== 'number' || data.quantity < 0) {
      errors.push('Quantity must be a non-negative number');
    }
    
    if (typeof data.reserved !== 'number' || data.reserved < 0) {
      errors.push('Reserved must be a non-negative number');
    }
    
    if (data.reserved > data.quantity) {
      errors.push('Reserved quantity cannot exceed total quantity');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

module.exports = InventoryItem;
