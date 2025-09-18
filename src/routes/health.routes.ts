import { Router } from 'express';
import { logger } from '../core/logger';
import { metrics } from '../utils/metrics';
import { getCircuitBreakerMetrics } from '../utils/circuitBreaker';
import { getBulkheadMetrics } from '../utils/bulkhead';
import { getLoadSheddingStats } from '../middleware/loadShedding';
import { getRateLimiterStats } from '../middleware/rateLimiter';

const router = Router();

// Basic health check
router.get('/', (req, res) => {
  logger.info({ req: { id: req.id } }, 'Health check requested');
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    }
  });
});

// Liveness probe - simple check if service is running
router.get('/liveness', (req, res) => {
  logger.debug({ req: { id: req.id } }, 'Liveness check requested');
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Readiness probe - check if service is ready to handle requests
router.get('/readiness', (req, res) => {
  logger.debug({ req: { id: req.id } }, 'Readiness check requested');
  
  try {
    const circuitBreakerMetrics = getCircuitBreakerMetrics();
    const bulkheadMetrics = getBulkheadMetrics();
    const loadSheddingStats = getLoadSheddingStats();
    
    // Check if any critical circuit breakers are open
    const criticalBreakersOpen = Object.values(circuitBreakerMetrics).some(
      (breaker: any) => breaker.state === 'open'
    );
    
    // Check if queues are over threshold
    const queueOverThreshold = Object.values(bulkheadMetrics).some(
      (bulkhead: any) => bulkhead.queued > bulkhead.queueSize * 0.8 // 80% threshold
    );
    
    // Check load shedding status
    const loadSheddingActive = loadSheddingStats.currentQueueDepth > loadSheddingStats.maxQueueDepth * 0.9;
    
    const ready = !criticalBreakersOpen && !queueOverThreshold && !loadSheddingActive;
    
    const response = {
      ready,
      timestamp: new Date().toISOString(),
      breakers: circuitBreakerMetrics,
      queueDepth: {
        api: bulkheadMetrics.apiBulkhead?.queued || 0,
        sync: bulkheadMetrics.syncBulkhead?.queued || 0,
        filesystem: bulkheadMetrics.fileSystemBulkhead?.queued || 0,
      },
      loadShedding: loadSheddingStats,
      criticalBreakersOpen,
      queueOverThreshold,
      loadSheddingActive,
    };
    
    if (ready) {
      res.json(response);
    } else {
      res.status(503).json(response);
    }
  } catch (error) {
    logger.error({ error }, 'Readiness check failed');
    res.status(503).json({
      ready: false,
      error: 'Readiness check failed',
      timestamp: new Date().toISOString(),
    });
  }
});

// Comprehensive metrics endpoint
router.get('/metrics', (req, res) => {
  logger.info({ req: { id: req.id } }, 'Metrics requested');
  
  try {
    const currentMetrics = metrics.getMetrics();
    const circuitBreakerMetrics = getCircuitBreakerMetrics();
    const bulkheadMetrics = getBulkheadMetrics();
    const loadSheddingStats = getLoadSheddingStats();
    const rateLimiterStats = getRateLimiterStats();
    
    const comprehensiveMetrics = {
      // Basic metrics
      requests: currentMetrics.requests,
      errors: currentMetrics.errors,
      conflicts: currentMetrics.conflicts,
      idempotentHits: currentMetrics.idempotentHits,
      
      // Rate limiting metrics
      rateLimited: currentMetrics.rateLimitHits,
      
      // Load shedding metrics
      shed: currentMetrics.loadSheddingRejections,
      
      // Circuit breaker metrics
      breakerOpen: Object.values(circuitBreakerMetrics).filter(
        (breaker: any) => breaker.state === 'open'
      ).length,
      
      // File system retry metrics
      fsRetries: currentMetrics.fileSystemRetries,
      
      // Snapshot metrics
      snapshots: currentMetrics.snapshotsCreated,
      
      // Additional system metrics
      system: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        timestamp: new Date().toISOString(),
      },
      
      // Circuit breaker details
      circuitBreakers: circuitBreakerMetrics,
      
      // Bulkhead details
      bulkheads: bulkheadMetrics,
      
      // Load shedding details
      loadShedding: loadSheddingStats,
      
      // Rate limiter details
      rateLimiter: rateLimiterStats,
    };
    
    res.json({
      success: true,
      data: comprehensiveMetrics,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get metrics');
    res.status(500).json({
      success: false,
      error: 'Failed to get metrics',
      timestamp: new Date().toISOString(),
    });
  }
});

export { router as healthRoutes };
