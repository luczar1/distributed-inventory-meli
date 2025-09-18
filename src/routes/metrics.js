/**
 * Metrics Routes
 * Express routes for metrics and monitoring
 */
const express = require('express');
const MetricsController = require('../controllers/metricsController');

const router = express.Router();

// Initialize controller
const metricsController = new MetricsController();

/**
 * @route GET /api/metrics
 * @desc Get all metrics
 * @access Public
 */
router.get('/', metricsController.getMetrics);

/**
 * @route GET /api/metrics/health
 * @desc Get health status
 * @access Public
 */
router.get('/health', metricsController.getHealth);

/**
 * @route GET /api/metrics/requests
 * @desc Get request metrics
 * @access Public
 */
router.get('/requests', metricsController.getRequestMetrics);

/**
 * @route GET /api/metrics/inventory
 * @desc Get inventory metrics
 * @access Public
 */
router.get('/inventory', metricsController.getInventoryMetrics);

/**
 * @route GET /api/metrics/concurrency
 * @desc Get concurrency metrics
 * @access Public
 */
router.get('/concurrency', metricsController.getConcurrencyMetrics);

/**
 * @route GET /api/metrics/persistence
 * @desc Get persistence metrics
 * @access Public
 */
router.get('/persistence', metricsController.getPersistenceMetrics);

/**
 * @route GET /api/metrics/system
 * @desc Get system metrics
 * @access Public
 */
router.get('/system', metricsController.getSystemMetrics);

/**
 * @route POST /api/metrics/reset
 * @desc Reset all metrics
 * @access Public
 */
router.post('/reset', metricsController.resetMetrics);

module.exports = router;
