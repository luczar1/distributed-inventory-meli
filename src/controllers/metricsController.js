/**
 * Metrics Controller
 * Exposes metrics and monitoring endpoints
 */
const metrics = require('../utils/metrics');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

class MetricsController {
  /**
   * Get all metrics
   */
  getMetrics = asyncHandler(async (req, res) => {
    logger.info('Metrics requested');
    
    const allMetrics = metrics.getMetrics();
    
    res.json({
      success: true,
      data: allMetrics
    });
  });

  /**
   * Get health status
   */
  getHealth = asyncHandler(async (req, res) => {
    logger.info('Health check requested');
    
    const healthStatus = metrics.getHealthStatus();
    
    const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json({
      success: healthStatus.status === 'healthy',
      data: healthStatus
    });
  });

  /**
   * Get request metrics
   */
  getRequestMetrics = asyncHandler(async (req, res) => {
    logger.info('Request metrics requested');
    
    const allMetrics = metrics.getMetrics();
    
    res.json({
      success: true,
      data: {
        requests: allMetrics.requests,
        timestamp: allMetrics.timestamp
      }
    });
  });

  /**
   * Get inventory metrics
   */
  getInventoryMetrics = asyncHandler(async (req, res) => {
    logger.info('Inventory metrics requested');
    
    const allMetrics = metrics.getMetrics();
    
    res.json({
      success: true,
      data: {
        inventory: allMetrics.inventory,
        timestamp: allMetrics.timestamp
      }
    });
  });

  /**
   * Get concurrency metrics
   */
  getConcurrencyMetrics = asyncHandler(async (req, res) => {
    logger.info('Concurrency metrics requested');
    
    const allMetrics = metrics.getMetrics();
    
    res.json({
      success: true,
      data: {
        concurrency: allMetrics.concurrency,
        timestamp: allMetrics.timestamp
      }
    });
  });

  /**
   * Get persistence metrics
   */
  getPersistenceMetrics = asyncHandler(async (req, res) => {
    logger.info('Persistence metrics requested');
    
    const allMetrics = metrics.getMetrics();
    
    res.json({
      success: true,
      data: {
        persistence: allMetrics.persistence,
        timestamp: allMetrics.timestamp
      }
    });
  });

  /**
   * Get system metrics
   */
  getSystemMetrics = asyncHandler(async (req, res) => {
    logger.info('System metrics requested');
    
    const allMetrics = metrics.getMetrics();
    
    res.json({
      success: true,
      data: {
        system: allMetrics.system,
        timestamp: allMetrics.timestamp
      }
    });
  });

  /**
   * Reset metrics
   */
  resetMetrics = asyncHandler(async (req, res) => {
    logger.info('Metrics reset requested');
    
    metrics.reset();
    
    res.json({
      success: true,
      message: 'Metrics reset successfully'
    });
  });
}

module.exports = MetricsController;
