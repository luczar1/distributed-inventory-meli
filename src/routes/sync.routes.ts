import { Router, NextFunction, Request, Response } from 'express';
import { logger } from '../core/logger';
import { syncWorker } from '../workers/sync.worker';

const router = Router();

// POST /sync - Manual sync trigger
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    logger.info({ req: { id: req.id } }, 'Manual sync requested');
    
    await syncWorker.syncOnce();
    
    res.json({ 
      success: true, 
      message: 'Sync completed successfully' 
    });
  } catch (error) {
    next(error);
  }
});

// GET /sync/status - Get sync worker status
router.get('/status', (req: Request, res: Response) => {
  const status = syncWorker.getStatus();
  res.json({
    success: true,
    data: status
  });
});

// POST /sync/start - Start periodic sync
router.post('/start', (req: Request, res: Response) => {
  const { intervalMs = 15000 } = req.body;
  
  syncWorker.startSync(intervalMs);
  
  res.json({
    success: true,
    message: `Sync worker started with interval ${intervalMs}ms`
  });
});

// POST /sync/stop - Stop periodic sync
router.post('/stop', (req: Request, res: Response) => {
  syncWorker.stopSync();
  
  res.json({
    success: true,
    message: 'Sync worker stopped'
  });
});

export { router as syncRoutes };
