import { Router } from 'express';
import { logger } from '../core/logger';
import { metrics } from '../utils/metrics';

const router = Router();

// GET /metrics - Return current metrics as JSON
router.get('/', (req, res) => {
  logger.info({ req: { id: req.id } }, 'Metrics requested');
  
  const currentMetrics = metrics.getMetrics();
  
  res.json({
    success: true,
    data: {
      ...currentMetrics,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    }
  });
});

// GET /metrics/reset - Reset all metrics (for testing)
router.post('/reset', (req, res) => {
  logger.info({ req: { id: req.id } }, 'Metrics reset requested');
  
  metrics.reset();
  
  res.json({
    success: true,
    message: 'Metrics reset successfully'
  });
});

export { router as metricsRoutes };
