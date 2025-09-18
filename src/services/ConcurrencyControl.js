/**
 * Concurrency Control Service
 * Manages optimistic concurrency control and async mutex for inventory operations
 */
const { Mutex } = require('async-mutex');
const logger = require('../utils/logger');

class ConcurrencyControl {
  constructor() {
    this.mutexes = new Map(); // Per-SKU mutexes
    this.versionTracker = new Map(); // Track versions for optimistic locking
    this.operationQueue = new Map(); // Queue operations per SKU
  }

  /**
   * Get or create mutex for a specific SKU
   * @param {string} sku - SKU identifier
   * @returns {Mutex}
   */
  getMutex(sku) {
    if (!this.mutexes.has(sku)) {
      this.mutexes.set(sku, new Mutex());
    }
    return this.mutexes.get(sku);
  }

  /**
   * Execute operation with per-SKU mutex
   * @param {string} sku - SKU identifier
   * @param {Function} operation - Operation to execute
   * @returns {Promise<any>}
   */
  async executeWithMutex(sku, operation) {
    const mutex = this.getMutex(sku);
    return await mutex.runExclusive(async () => {
      try {
        logger.debug(`Executing operation for SKU: ${sku}`);
        const result = await operation();
        logger.debug(`Operation completed for SKU: ${sku}`);
        return result;
      } catch (error) {
        logger.error(`Operation failed for SKU: ${sku}`, error);
        throw error;
      }
    });
  }

  /**
   * Check if version matches for optimistic locking
   * @param {string} sku - SKU identifier
   * @param {number} expectedVersion - Expected version
   * @returns {boolean}
   */
  checkVersion(sku, expectedVersion) {
    const currentVersion = this.versionTracker.get(sku) || 1;
    return currentVersion === expectedVersion;
  }

  /**
   * Update version for a SKU
   * @param {string} sku - SKU identifier
   * @param {number} newVersion - New version number
   */
  updateVersion(sku, newVersion) {
    this.versionTracker.set(sku, newVersion);
    logger.debug(`Updated version for SKU ${sku} to ${newVersion}`);
  }

  /**
   * Get current version for a SKU
   * @param {string} sku - SKU identifier
   * @returns {number}
   */
  getVersion(sku) {
    return this.versionTracker.get(sku) || 1;
  }

  /**
   * Increment version for a SKU
   * @param {string} sku - SKU identifier
   * @returns {number} - New version number
   */
  incrementVersion(sku) {
    const currentVersion = this.getVersion(sku);
    const newVersion = currentVersion + 1;
    this.updateVersion(sku, newVersion);
    return newVersion;
  }

  /**
   * Execute operation with optimistic concurrency control
   * @param {string} sku - SKU identifier
   * @param {number} expectedVersion - Expected version
   * @param {Function} operation - Operation to execute
   * @returns {Promise<Object>}
   */
  async executeWithOptimisticLock(sku, expectedVersion, operation) {
    return await this.executeWithMutex(sku, async () => {
      // Check version before executing
      if (!this.checkVersion(sku, expectedVersion)) {
        const currentVersion = this.getVersion(sku);
        throw new Error(
          `Version mismatch for SKU ${sku}. Expected: ${expectedVersion}, Current: ${currentVersion}`
        );
      }

      try {
        const result = await operation();
        
        // Increment version after successful operation
        const newVersion = this.incrementVersion(sku);
        
        return {
          ...result,
          version: newVersion
        };
      } catch (error) {
        logger.error(`Optimistic lock operation failed for SKU: ${sku}`, error);
        throw error;
      }
    });
  }

  /**
   * Queue operation for a specific SKU
   * @param {string} sku - SKU identifier
   * @param {Function} operation - Operation to queue
   * @returns {Promise<any>}
   */
  async queueOperation(sku, operation) {
    if (!this.operationQueue.has(sku)) {
      this.operationQueue.set(sku, []);
    }

    const queue = this.operationQueue.get(sku);
    
    return new Promise((resolve, reject) => {
      queue.push({ operation, resolve, reject });
      this.processQueue(sku);
    });
  }

  /**
   * Process queued operations for a SKU
   * @param {string} sku - SKU identifier
   */
  async processQueue(sku) {
    const queue = this.operationQueue.get(sku);
    if (!queue || queue.length === 0) return;

    const { operation, resolve, reject } = queue.shift();
    
    try {
      const result = await this.executeWithMutex(sku, operation);
      resolve(result);
    } catch (error) {
      reject(error);
    }

    // Process next operation
    if (queue.length > 0) {
      setImmediate(() => this.processQueue(sku));
    }
  }

  /**
   * Get concurrency statistics
   * @returns {Object}
   */
  getStats() {
    return {
      activeMutexes: this.mutexes.size,
      queuedOperations: Array.from(this.operationQueue.entries())
        .reduce((total, [, queue]) => total + queue.length, 0),
      trackedVersions: this.versionTracker.size
    };
  }

  /**
   * Clear all concurrency control data
   */
  clear() {
    this.mutexes.clear();
    this.versionTracker.clear();
    this.operationQueue.clear();
    logger.info('Concurrency control data cleared');
  }
}

module.exports = ConcurrencyControl;
