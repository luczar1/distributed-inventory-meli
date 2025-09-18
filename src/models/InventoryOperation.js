/**
 * Inventory Operation Model
 * Represents an operation on inventory with idempotency support
 */
class InventoryOperation {
  constructor(type, sku, amount, idempotencyKey = null, metadata = {}) {
    this.id = require('uuid').v4();
    this.type = type; // 'add', 'remove', 'reserve', 'release', 'adjust'
    this.sku = sku;
    this.amount = amount;
    this.idempotencyKey = idempotencyKey || require('uuid').v4();
    this.metadata = metadata;
    this.timestamp = new Date().toISOString();
    this.status = 'pending'; // 'pending', 'completed', 'failed', 'cancelled'
    this.retryCount = 0;
    this.maxRetries = 3;
  }

  /**
   * Mark operation as completed
   */
  complete() {
    this.status = 'completed';
    this.completedAt = new Date().toISOString();
  }

  /**
   * Mark operation as failed
   * @param {string} error - Error message
   */
  fail(error) {
    this.status = 'failed';
    this.error = error;
    this.failedAt = new Date().toISOString();
  }

  /**
   * Mark operation as cancelled
   */
  cancel() {
    this.status = 'cancelled';
    this.cancelledAt = new Date().toISOString();
  }

  /**
   * Increment retry count
   * @returns {boolean} - Whether retry is allowed
   */
  incrementRetry() {
    this.retryCount++;
    return this.retryCount <= this.maxRetries;
  }

  /**
   * Check if operation can be retried
   * @returns {boolean}
   */
  canRetry() {
    return this.status === 'failed' && this.retryCount < this.maxRetries;
  }

  /**
   * Convert to JSON representation
   */
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      sku: this.sku,
      amount: this.amount,
      idempotencyKey: this.idempotencyKey,
      metadata: this.metadata,
      timestamp: this.timestamp,
      status: this.status,
      retryCount: this.retryCount,
      maxRetries: this.maxRetries,
      completedAt: this.completedAt,
      failedAt: this.failedAt,
      cancelledAt: this.cancelledAt,
      error: this.error
    };
  }

  /**
   * Create from JSON data
   * @param {Object} data - JSON data
   * @returns {InventoryOperation}
   */
  static fromJSON(data) {
    const operation = new InventoryOperation(
      data.type,
      data.sku,
      data.amount,
      data.idempotencyKey,
      data.metadata
    );
    operation.id = data.id;
    operation.timestamp = data.timestamp;
    operation.status = data.status;
    operation.retryCount = data.retryCount || 0;
    operation.maxRetries = data.maxRetries || 3;
    operation.completedAt = data.completedAt;
    operation.failedAt = data.failedAt;
    operation.cancelledAt = data.cancelledAt;
    operation.error = data.error;
    return operation;
  }

  /**
   * Validate operation data
   * @param {Object} data - Operation data to validate
   * @returns {Object} - Validation result
   */
  static validate(data) {
    const errors = [];
    const validTypes = ['add', 'remove', 'reserve', 'release', 'adjust'];
    
    if (!validTypes.includes(data.type)) {
      errors.push(`Type must be one of: ${validTypes.join(', ')}`);
    }
    
    if (!data.sku || typeof data.sku !== 'string') {
      errors.push('SKU is required and must be a string');
    }
    
    if (typeof data.amount !== 'number' || data.amount <= 0) {
      errors.push('Amount must be a positive number');
    }
    
    if (data.idempotencyKey && typeof data.idempotencyKey !== 'string') {
      errors.push('Idempotency key must be a string');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

module.exports = InventoryOperation;
