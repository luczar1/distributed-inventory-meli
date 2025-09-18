/**
 * Inventory Controller
 * REST API endpoints for inventory operations
 */
const Joi = require('joi');
const InventoryService = require('../services/InventoryService');
const { ErrorHandler } = require('../utils/errors');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

// Validation schemas
const addItemSchema = Joi.object({
  sku: Joi.string().required(),
  name: Joi.string().required(),
  quantity: Joi.number().min(0).required(),
  idempotencyKey: Joi.string().optional()
});

const updateQuantitySchema = Joi.object({
  quantity: Joi.number().min(0).required(),
  idempotencyKey: Joi.string().optional()
});

const operationSchema = Joi.object({
  quantity: Joi.number().min(1).required(),
  idempotencyKey: Joi.string().optional()
});

class InventoryController {
  constructor(storeId = 'default') {
    this.inventoryService = new InventoryService(storeId);
  }

  /**
   * Add new inventory item
   */
  addItem = asyncHandler(async (req, res) => {
    const { error, value } = addItemSchema.validate(req.body);
    if (error) {
      throw ErrorHandler.validation(error.details[0].message, error.details[0].path[0]);
    }

    const { sku, name, quantity, idempotencyKey } = value;
    
    logger.info(`Adding item: ${sku}`, { sku, name, quantity, idempotencyKey });
    
    const result = await this.inventoryService.addItem(sku, name, quantity, idempotencyKey);
    
    res.status(201).json({
      success: true,
      data: result.item,
      operation: result.operation,
      message: result.message || 'Item added successfully'
    });
  });

  /**
   * Get inventory item by SKU
   */
  getItem = asyncHandler(async (req, res) => {
    const { sku } = req.params;
    
    if (!sku) {
      throw ErrorHandler.validation('SKU is required', 'sku');
    }
    
    logger.info(`Getting item: ${sku}`);
    
    const item = await this.inventoryService.getItem(sku);
    
    res.json({
      success: true,
      data: item
    });
  });

  /**
   * Get all inventory items
   */
  getAllItems = asyncHandler(async (req, res) => {
    logger.info('Getting all items');
    
    const items = await this.inventoryService.getAllItems();
    
    res.json({
      success: true,
      data: items,
      count: Object.keys(items).length
    });
  });

  /**
   * Update item quantity
   */
  updateQuantity = asyncHandler(async (req, res) => {
    const { sku } = req.params;
    const { error, value } = updateQuantitySchema.validate(req.body);
    
    if (error) {
      throw ErrorHandler.validation(error.details[0].message, error.details[0].path[0]);
    }

    const { quantity, idempotencyKey } = value;
    
    if (!sku) {
      throw ErrorHandler.validation('SKU is required', 'sku');
    }
    
    logger.info(`Updating quantity for item: ${sku}`, { sku, quantity, idempotencyKey });
    
    // Get current item to determine operation type
    try {
      const currentItem = await this.inventoryService.getItem(sku);
      const currentQuantity = currentItem.quantity;
      
      if (quantity > currentQuantity) {
        // Add quantity
        const addAmount = quantity - currentQuantity;
        const result = await this.inventoryService.addItem(sku, currentItem.name, addAmount, idempotencyKey);
        
        res.json({
          success: true,
          data: result.item,
          operation: result.operation,
          message: 'Quantity updated successfully'
        });
      } else if (quantity < currentQuantity) {
        // Remove quantity
        const removeAmount = currentQuantity - quantity;
        const result = await this.inventoryService.removeItem(sku, removeAmount, idempotencyKey);
        
        res.json({
          success: true,
          data: result.item,
          operation: result.operation,
          message: 'Quantity updated successfully'
        });
      } else {
        // No change
        res.json({
          success: true,
          data: currentItem,
          message: 'Quantity unchanged'
        });
      }
    } catch (error) {
      if (error.name === 'NotFoundError') {
        throw ErrorHandler.notFound('Item', sku);
      }
      throw error;
    }
  });

  /**
   * Reserve inventory
   */
  reserveItem = asyncHandler(async (req, res) => {
    const { sku } = req.params;
    const { error, value } = operationSchema.validate(req.body);
    
    if (error) {
      throw ErrorHandler.validation(error.details[0].message, error.details[0].path[0]);
    }

    const { quantity, idempotencyKey } = value;
    
    if (!sku) {
      throw ErrorHandler.validation('SKU is required', 'sku');
    }
    
    logger.info(`Reserving item: ${sku}`, { sku, quantity, idempotencyKey });
    
    const result = await this.inventoryService.reserveItem(sku, quantity, idempotencyKey);
    
    res.json({
      success: true,
      data: result.item,
      operation: result.operation,
      message: 'Item reserved successfully'
    });
  });

  /**
   * Release reserved inventory
   */
  releaseItem = asyncHandler(async (req, res) => {
    const { sku } = req.params;
    const { error, value } = operationSchema.validate(req.body);
    
    if (error) {
      throw ErrorHandler.validation(error.details[0].message, error.details[0].path[0]);
    }

    const { quantity, idempotencyKey } = value;
    
    if (!sku) {
      throw ErrorHandler.validation('SKU is required', 'sku');
    }
    
    logger.info(`Releasing item: ${sku}`, { sku, quantity, idempotencyKey });
    
    const result = await this.inventoryService.releaseItem(sku, quantity, idempotencyKey);
    
    res.json({
      success: true,
      data: result.item,
      operation: result.operation,
      message: 'Item released successfully'
    });
  });

  /**
   * Get operation status by idempotency key
   */
  getOperation = asyncHandler(async (req, res) => {
    const { idempotencyKey } = req.params;
    
    if (!idempotencyKey) {
      throw ErrorHandler.validation('Idempotency key is required', 'idempotencyKey');
    }
    
    logger.info(`Getting operation status: ${idempotencyKey}`);
    
    const operation = this.inventoryService.getOperation(idempotencyKey);
    
    if (!operation) {
      throw ErrorHandler.notFound('Operation', idempotencyKey);
    }
    
    res.json({
      success: true,
      data: operation.toJSON()
    });
  });

  /**
   * Get service statistics
   */
  getStats = asyncHandler(async (req, res) => {
    logger.info('Getting service statistics');
    
    const stats = this.inventoryService.getStats();
    
    res.json({
      success: true,
      data: stats
    });
  });
}

module.exports = InventoryController;
