/**
 * Metrics and Monitoring Utility
 * Collects and exposes system metrics for observability
 */
const logger = require('./logger');

class MetricsCollector {
  constructor() {
    this.metrics = {
      requests: {
        total: 0,
        successful: 0,
        failed: 0,
        byMethod: {},
        byEndpoint: {}
      },
      inventory: {
        operations: {
          add: 0,
          remove: 0,
          reserve: 0,
          release: 0,
          get: 0
        },
        items: {
          total: 0,
          withStock: 0,
          outOfStock: 0
        }
      },
      concurrency: {
        activeMutexes: 0,
        queuedOperations: 0,
        versionConflicts: 0
      },
      persistence: {
        readOperations: 0,
        writeOperations: 0,
        failedOperations: 0,
        retryOperations: 0
      },
      system: {
        uptime: 0,
        memoryUsage: {},
        cpuUsage: 0
      }
    };
    
    this.startTime = Date.now();
    this.updateSystemMetrics();
    
    // Update system metrics every 30 seconds
    setInterval(() => {
      this.updateSystemMetrics();
    }, 30000);
  }

  /**
   * Increment request counter
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint
   * @param {boolean} success - Whether request was successful
   */
  incrementRequest(method, endpoint, success = true) {
    this.metrics.requests.total++;
    
    if (success) {
      this.metrics.requests.successful++;
    } else {
      this.metrics.requests.failed++;
    }
    
    // Track by method
    if (!this.metrics.requests.byMethod[method]) {
      this.metrics.requests.byMethod[method] = 0;
    }
    this.metrics.requests.byMethod[method]++;
    
    // Track by endpoint
    if (!this.metrics.requests.byEndpoint[endpoint]) {
      this.metrics.requests.byEndpoint[endpoint] = 0;
    }
    this.metrics.requests.byEndpoint[endpoint]++;
  }

  /**
   * Increment inventory operation counter
   * @param {string} operation - Operation type
   */
  incrementInventoryOperation(operation) {
    if (this.metrics.inventory.operations[operation] !== undefined) {
      this.metrics.inventory.operations[operation]++;
    }
  }

  /**
   * Update inventory item metrics
   * @param {Object} items - Inventory items
   */
  updateInventoryMetrics(items) {
    const itemCount = Object.keys(items).length;
    let withStock = 0;
    let outOfStock = 0;
    
    for (const item of Object.values(items)) {
      if (item.available > 0) {
        withStock++;
      } else {
        outOfStock++;
      }
    }
    
    this.metrics.inventory.items = {
      total: itemCount,
      withStock,
      outOfStock
    };
  }

  /**
   * Increment concurrency conflict
   */
  incrementVersionConflict() {
    this.metrics.concurrency.versionConflicts++;
  }

  /**
   * Update concurrency metrics
   * @param {Object} concurrencyStats - Concurrency statistics
   */
  updateConcurrencyMetrics(concurrencyStats) {
    this.metrics.concurrency.activeMutexes = concurrencyStats.activeMutexes || 0;
    this.metrics.concurrency.queuedOperations = concurrencyStats.queuedOperations || 0;
  }

  /**
   * Increment persistence operation
   * @param {string} operation - Operation type (read/write)
   * @param {boolean} success - Whether operation was successful
   */
  incrementPersistenceOperation(operation, success = true) {
    if (operation === 'read') {
      this.metrics.persistence.readOperations++;
    } else if (operation === 'write') {
      this.metrics.persistence.writeOperations++;
    }
    
    if (!success) {
      this.metrics.persistence.failedOperations++;
    }
  }

  /**
   * Increment retry operation
   */
  incrementRetryOperation() {
    this.metrics.persistence.retryOperations++;
  }

  /**
   * Update system metrics
   */
  updateSystemMetrics() {
    this.metrics.system.uptime = Date.now() - this.startTime;
    
    const memUsage = process.memoryUsage();
    this.metrics.system.memoryUsage = {
      rss: Math.round(memUsage.rss / 1024 / 1024), // MB
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
      external: Math.round(memUsage.external / 1024 / 1024) // MB
    };
  }

  /**
   * Get all metrics
   * @returns {Object}
   */
  getMetrics() {
    this.updateSystemMetrics();
    return {
      ...this.metrics,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get health status
   * @returns {Object}
   */
  getHealthStatus() {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
    const heapUsagePercent = (heapUsedMB / heapTotalMB) * 100;
    
    const isHealthy = heapUsagePercent < 90 && this.metrics.persistence.failedOperations < 10;
    
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: this.metrics.system.uptime,
      memoryUsage: heapUsagePercent,
      failedOperations: this.metrics.persistence.failedOperations,
      versionConflicts: this.metrics.concurrency.versionConflicts
    };
  }

  /**
   * Reset metrics
   */
  reset() {
    this.metrics = {
      requests: {
        total: 0,
        successful: 0,
        failed: 0,
        byMethod: {},
        byEndpoint: {}
      },
      inventory: {
        operations: {
          add: 0,
          remove: 0,
          reserve: 0,
          release: 0,
          get: 0
        },
        items: {
          total: 0,
          withStock: 0,
          outOfStock: 0
        }
      },
      concurrency: {
        activeMutexes: 0,
        queuedOperations: 0,
        versionConflicts: 0
      },
      persistence: {
        readOperations: 0,
        writeOperations: 0,
        failedOperations: 0,
        retryOperations: 0
      },
      system: {
        uptime: 0,
        memoryUsage: {},
        cpuUsage: 0
      }
    };
    
    this.startTime = Date.now();
    logger.info('Metrics reset');
  }
}

// Global metrics instance
const metrics = new MetricsCollector();

module.exports = metrics;
