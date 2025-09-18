import { Router } from 'express';
import { logger } from '../core/logger';

const router = Router();

router.get('/', (req, res) => {
  logger.info({ req: { id: req.id } }, 'Health check requested');
  res.json({ status: 'ok' });
});

export { router as healthRoutes };
