/**
 * Inventory Routes
 * Express routes for inventory operations
 */
const express = require('express');
const InventoryController = require('../controllers/inventoryController');

const router = express.Router();

// Initialize controller
const inventoryController = new InventoryController();

/**
 * @route POST /api/inventory/items
 * @desc Add new inventory item
 * @access Public
 */
router.post('/items', inventoryController.addItem);

/**
 * @route GET /api/inventory/items
 * @desc Get all inventory items
 * @access Public
 */
router.get('/items', inventoryController.getAllItems);

/**
 * @route GET /api/inventory/items/:sku
 * @desc Get inventory item by SKU
 * @access Public
 */
router.get('/items/:sku', inventoryController.getItem);

/**
 * @route PUT /api/inventory/items/:sku/quantity
 * @desc Update item quantity
 * @access Public
 */
router.put('/items/:sku/quantity', inventoryController.updateQuantity);

/**
 * @route POST /api/inventory/items/:sku/reserve
 * @desc Reserve inventory
 * @access Public
 */
router.post('/items/:sku/reserve', inventoryController.reserveItem);

/**
 * @route POST /api/inventory/items/:sku/release
 * @desc Release reserved inventory
 * @access Public
 */
router.post('/items/:sku/release', inventoryController.releaseItem);

/**
 * @route GET /api/inventory/operations/:idempotencyKey
 * @desc Get operation status by idempotency key
 * @access Public
 */
router.get('/operations/:idempotencyKey', inventoryController.getOperation);

/**
 * @route GET /api/inventory/stats
 * @desc Get service statistics
 * @access Public
 */
router.get('/stats', inventoryController.getStats);

module.exports = router;
