import { Router, NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '../core/logger';
import { inventoryService } from '../services/inventory.service';
import { inventoryRepository } from '../repositories/inventory.repo';
import { validateBody, validateParams } from '../middleware/validate';
import { incrementGetInventory } from '../utils/metrics';

const router = Router();

// Validation schemas
const StoreParamsSchema = z.object({
  storeId: z.string().min(1).max(20),
  sku: z.string().min(1).max(50),
});

const AdjustStockSchema = z.object({
  delta: z.number().int(),
  expectedVersion: z.number().int().positive().optional(),
});

const ReserveStockSchema = z.object({
  qty: z.number().int().min(0),
  expectedVersion: z.number().int().positive().optional(),
});

const CreateInventorySchema = z.object({
  sku: z.string().min(1).max(50),
  storeId: z.string().min(1).max(20),
  initialQuantity: z.number().int().min(0),
});

// GET /:sku/:storeId (for backward compatibility with tests)
router.get('/:sku/:storeId', 
  validateParams(StoreParamsSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sku, storeId } = req.params;
      logger.info({ req: { id: req.id }, sku, storeId }, 'Get inventory requested');
      
      // Mock response for now - will be replaced with actual service call
      const record = {
        success: true,
        data: {
          sku,
          storeId,
          qty: 100,
          version: 1,
          updatedAt: new Date(),
        }
      };
      
      // Increment metrics
      incrementGetInventory();
      
      // Set ETag header with version
      res.set('ETag', `"${record.data.version}"`);
      res.json(record);
    } catch (error) {
      next(error);
    }
  }
);

// POST / (create inventory item)
router.post('/', 
  validateBody(CreateInventorySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sku, storeId, initialQuantity } = req.body;
      logger.info({ req: { id: req.id }, sku, storeId, initialQuantity }, 'Create inventory requested');
      
      // Mock response for now - will be replaced with actual service call
      const record = {
        success: true,
        data: {
          sku,
          storeId,
          qty: initialQuantity,
          version: 1,
          updatedAt: new Date(),
        }
      };
      
      res.status(201).json(record);
    } catch (error) {
      next(error);
    }
  }
);

// GET /stores/:storeId/inventory/:sku
router.get('/stores/:storeId/inventory/:sku',
  validateParams(StoreParamsSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sku, storeId } = req.params;
      logger.info({ req: { id: req.id }, sku, storeId }, 'Get inventory requested');

      // Get inventory record from repository
      const record = await inventoryRepository.get(sku, storeId);

      // Increment metrics
      incrementGetInventory();

      // Set ETag header with version
      res.set('ETag', `"${record.version}"`);
      res.json(record);
    } catch (error) {
      next(error);
    }
  }
);

// POST /stores/:storeId/inventory/:sku/adjust
router.post('/stores/:storeId/inventory/:sku/adjust',
  validateParams(StoreParamsSchema),
  validateBody(AdjustStockSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sku, storeId } = req.params;
      const { delta, expectedVersion } = req.body;
      const idempotencyKey = req.headers['idempotency-key'] as string;

      logger.info({
        req: { id: req.id },
        sku,
        storeId,
        delta,
        expectedVersion,
        idempotencyKey
      }, 'Adjust stock requested');

      // Call the actual service
      const result = await inventoryService.adjustStock(storeId, sku, delta, expectedVersion, idempotencyKey);

      // Get the updated record for the response
      const record = await inventoryRepository.get(sku, storeId);

      const response = {
        success: true,
        newQuantity: result.qty,
        newVersion: result.version,
        record: {
          sku,
          storeId,
          qty: result.qty,
          version: result.version,
          updatedAt: record.updatedAt,
        },
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// POST /stores/:storeId/inventory/:sku/reserve
router.post('/stores/:storeId/inventory/:sku/reserve',
  validateParams(StoreParamsSchema),
  validateBody(ReserveStockSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sku, storeId } = req.params;
      const { qty, expectedVersion } = req.body;
      const idempotencyKey = req.headers['idempotency-key'] as string;

      logger.info({
        req: { id: req.id },
        sku,
        storeId,
        qty,
        expectedVersion,
        idempotencyKey
      }, 'Reserve stock requested');

      // Call the actual service
      const result = await inventoryService.reserveStock(storeId, sku, qty, expectedVersion, idempotencyKey);

      // Get the updated record for the response
      const record = await inventoryRepository.get(sku, storeId);

      const response = {
        success: true,
        newQuantity: result.qty,
        newVersion: result.version,
        record: {
          sku,
          storeId,
          qty: result.qty,
          version: result.version,
          updatedAt: record.updatedAt,
        },
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

export { router as inventoryRoutes };