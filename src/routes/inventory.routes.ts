import { Router, NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '../core/logger';
import { inventoryService } from '../services/inventory.service';
import { inventoryRepository } from '../repositories/inventory.repo';
import { validateBody, validateParams } from '../middleware/validate';
import { ifMatchMiddleware, checkVersionPrecondition } from '../middleware/versionPrecondition';
import { incrementGetInventory } from '../utils/metrics';
import { apiBreaker } from '../utils/circuitBreaker';
import { apiBulkhead } from '../utils/bulkhead';

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
      await apiBulkhead.run(async () => {
        return apiBreaker.execute(async () => {
          const { sku, storeId } = req.params as { sku: string; storeId: string };
          logger.info({ req: { id: req.id }, sku, storeId }, 'Get inventory requested');
          
          // Get actual inventory record
          const record = await inventoryRepository.get(sku, storeId);
          
          // Increment metrics
          incrementGetInventory();
          
          // Set ETag header with version
          res.set('ETag', `"${record.version}"`);
          res.json({
            success: true,
            data: record
          });
        });
      });
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
      await apiBulkhead.run(async () => {
        return apiBreaker.execute(async () => {
          const { sku, storeId, initialQuantity } = req.body;
          logger.info({ req: { id: req.id }, sku, storeId, initialQuantity }, 'Create inventory requested');
          
          // Create inventory record
          const record = {
            sku,
            storeId,
            qty: initialQuantity,
            version: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          
          await inventoryRepository.upsert(record);
          
          res.status(201).json({
            success: true,
            data: record
          });
        });
      });
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
      await apiBulkhead.run(async () => {
        return apiBreaker.execute(async () => {
          const { sku, storeId } = req.params as { sku: string; storeId: string };
          logger.info({ req: { id: req.id }, sku, storeId }, 'Get inventory requested');

          // Get inventory record from repository
          const record = await inventoryRepository.get(sku, storeId);

          // Increment metrics
          incrementGetInventory();

          // Set ETag header with version
          res.set('ETag', `"${record.version}"`);
          res.json(record);
        });
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /stores/:storeId/inventory/:sku/adjust
router.post('/stores/:storeId/inventory/:sku/adjust',
  validateParams(StoreParamsSchema),
  validateBody(AdjustStockSchema),
  ifMatchMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      logger.info({ reqId: req.id, path: req.path, method: req.method }, 'Adjust route hit');
      await apiBulkhead.run(async () => {
        return apiBreaker.execute(async () => {
          const { sku, storeId } = req.params as { sku: string; storeId: string };
          const { delta, expectedVersion } = req.body;
          const ifMatchVersion = (req as any).ifMatchVersion;
          const idempotencyKey = req.headers['idempotency-key'] as string;

          logger.debug({ reqId: req.id, ifMatchVersion, expectedVersion }, 'Version values extracted');

          logger.info({
            req: { id: req.id },
            sku,
            storeId,
            delta,
            expectedVersion,
            ifMatchVersion,
            idempotencyKey
          }, 'Adjust stock requested');

          // Check version precondition (If-Match header takes precedence)
          const currentRecord = await inventoryRepository.get(sku, storeId);
          try {
            checkVersionPrecondition(currentRecord.version, ifMatchVersion, expectedVersion);
          } catch (error) {
            logger.error({ error, currentVersion: currentRecord.version, ifMatchVersion, expectedVersion }, 'Version precondition check failed');
            throw error;
          }

          // Call the actual service with the resolved version
          const resolvedVersion = ifMatchVersion ?? expectedVersion;
          const result = await inventoryService.adjustStock(storeId, sku, delta, resolvedVersion, idempotencyKey);

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
        });
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /stores/:storeId/inventory/:sku/reserve
router.post('/stores/:storeId/inventory/:sku/reserve',
  validateParams(StoreParamsSchema),
  validateBody(ReserveStockSchema),
  ifMatchMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await apiBulkhead.run(async () => {
        return apiBreaker.execute(async () => {
          const { sku, storeId } = req.params as { sku: string; storeId: string };
          const { qty, expectedVersion } = req.body;
          const ifMatchVersion = (req as any).ifMatchVersion;
          const idempotencyKey = req.headers['idempotency-key'] as string;

          logger.info({
            req: { id: req.id },
            sku,
            storeId,
            qty,
            expectedVersion,
            ifMatchVersion,
            idempotencyKey
          }, 'Reserve stock requested');

          // Check version precondition (If-Match header takes precedence)
          const currentRecord = await inventoryRepository.get(sku, storeId);
          checkVersionPrecondition(currentRecord.version, ifMatchVersion, expectedVersion);

          // Call the actual service with the resolved version
          const resolvedVersion = ifMatchVersion ?? expectedVersion;
          const result = await inventoryService.reserveStock(storeId, sku, qty, resolvedVersion, idempotencyKey);

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
        });
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as inventoryRoutes };