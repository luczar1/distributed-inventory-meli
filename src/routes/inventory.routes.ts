import { Router } from 'express';
import { logger } from '../core/logger';
import { ValidationError } from '../core/errors';

const router = Router();

// Basic inventory endpoints for testing
router.get('/:sku/:storeId', (req, res) => {
  const { sku, storeId } = req.params;
  logger.info({ req: { id: req.id }, sku, storeId }, 'Get inventory requested');
  
  // Mock response for testing
  res.json({
    success: true,
    data: {
      sku,
      storeId,
      qty: 100,
      version: 1,
      updatedAt: new Date(),
    },
  });
});

router.post('/', (req, res, next) => {
  try {
    const { sku, storeId, initialQuantity } = req.body;
    logger.info({ req: { id: req.id }, sku, storeId, initialQuantity }, 'Create inventory requested');
    
    if (!sku || !storeId || initialQuantity === undefined) {
      throw new ValidationError('Missing required fields: sku, storeId, initialQuantity');
    }
    
    // Mock response for testing
    res.status(201).json({
      success: true,
      data: {
        sku,
        storeId,
        qty: initialQuantity,
        version: 1,
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    next(error);
  }
});

export { router as inventoryRoutes };
