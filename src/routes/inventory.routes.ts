import { Router, NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '../core/logger';
import { ValidationError } from '../core/errors';
import { inventoryService } from '../services/inventory.service';
import { syncWorker } from '../workers/sync.worker';
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

// GET /stores/:storeId/inventory/:sku
router.get('/stores/:storeId/inventory/:sku', 
  validateParams(StoreParamsSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sku, storeId } = req.params;
      logger.info({ req: { id: req.id }, sku, storeId }, 'Get inventory requested');
      
      // Mock response for now - will be replaced with actual service call
      const record = {
        sku,
        storeId,
        qty: 100,
        version: 1,
        updatedAt: new Date(),
      };
      
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
      
      // Mock response for now - will be replaced with actual service call
      const result = {
        success: true,
        newQuantity: 100 + delta,
        newVersion: 2,
        record: {
          sku,
          storeId,
          qty: 100 + delta,
          version: 2,
          updatedAt: new Date(),
        },
      };
      
      res.json(result);
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
      
      // Mock response for now - will be replaced with actual service call
      const result = {
        success: true,
        newQuantity: 100 - qty,
        newVersion: 2,
        record: {
          sku,
          storeId,
          qty: 100 - qty,
          version: 2,
          updatedAt: new Date(),
        },
      };
      
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

export { router as inventoryRoutes };