/**
 * Metrics Middleware
 * Collects request metrics and performance data
 */
const metrics = require('../utils/metrics');
const logger = require('../utils/logger');

/**
 * Request metrics middleware
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next function
 */
const metricsMiddleware = (req, res, next) => {
  const startTime = Date.now();
  const method = req.method;
  const endpoint = req.route ? req.route.path : req.path;
  
  // Override res.end to capture response metrics
  const originalEnd = res.end;
  res.end = function(...args) {
    const duration = Date.now() - startTime;
    const success = res.statusCode < 400;
    
    // Record metrics
    metrics.incrementRequest(method, endpoint, success);
    
    // Log performance
    if (duration > 1000) { // Log slow requests
      logger.warn(`Slow request detected`, {
        method,
        endpoint,
        duration,
        statusCode: res.statusCode,
        requestId: req.requestId
      });
    }
    
    // Call original end
    originalEnd.apply(this, args);
  };
  
  next();
};

/**
 * Inventory operation metrics middleware
 * @param {string} operation - Operation type
 * @returns {Function} - Middleware function
 */
const inventoryMetricsMiddleware = (operation) => {
  return (req, res, next) => {
    const startTime = Date.now();
    
    // Override res.json to capture operation metrics
    const originalJson = res.json;
    res.json = function(data) {
      const duration = Date.now() - startTime;
      const success = res.statusCode < 400;
      
      if (success) {
        metrics.incrementInventoryOperation(operation);
      }
      
      // Log operation performance
      logger.info(`Inventory operation completed`, {
        operation,
        duration,
        success,
        sku: req.params.sku,
        requestId: req.requestId
      });
      
      // Call original json
      return originalJson.call(this, data);
    };
    
    next();
  };
};

/**
 * Error metrics middleware
 * @param {Error} error - Error object
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next function
 */
const errorMetricsMiddleware = (error, req, res, next) => {
  // Record error metrics
  metrics.incrementRequest(req.method, req.route?.path || req.path, false);
  
  // Log error details
  logger.error('Request error captured by metrics', {
    error: error.message,
    stack: error.stack,
    method: req.method,
    endpoint: req.route?.path || req.path,
    statusCode: error.statusCode || 500,
    requestId: req.requestId
  });
  
  next(error);
};

module.exports = {
  metricsMiddleware,
  inventoryMetricsMiddleware,
  errorMetricsMiddleware
};
