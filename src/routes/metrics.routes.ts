import { Router } from 'express';
import { logger } from '../core/logger';
import { metrics } from '../utils/metrics';
import { getRateLimiterStats } from '../middleware/rateLimiter';
import { getLoadSheddingStats } from '../middleware/loadShedding';
import { getCircuitBreakerMetrics } from '../utils/circuitBreaker';
import { getBulkheadMetrics } from '../utils/bulkhead';

const router = Router();

// GET /metrics - Return current metrics as JSON
router.get('/', (req, res) => {
  logger.info({ req: { id: req.id } }, 'Metrics requested');
  
  const currentMetrics = metrics.getMetrics();
  const rateLimiterStats = getRateLimiterStats();
  const loadSheddingStats = getLoadSheddingStats();
  const circuitBreakerMetrics = getCircuitBreakerMetrics();
  const bulkheadMetrics = getBulkheadMetrics();
  
  res.json({
    success: true,
    data: {
      ...currentMetrics,
      rateLimiter: rateLimiterStats,
      loadShedding: loadSheddingStats,
      circuitBreakers: circuitBreakerMetrics,
      bulkheads: bulkheadMetrics,
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
