import { Request, Response, NextFunction } from 'express';
import { logger } from '../core/logger';
import { config } from '../core/config';
import { apiBulkhead, syncBulkhead } from '../utils/bulkhead';

interface LoadSheddingStats {
  name: string;
  queueDepth: number;
  maxQueueDepth: number;
  shedRequests: number;
  totalRequests: number;
}

export class LoadShedder {
  private shedRequests = 0;
  private totalRequests = 0;

  constructor(private name: string) {
    logger.info({
      name,
      maxQueueDepth: config.LOAD_SHED_QUEUE_MAX,
    }, 'Load shedder created');
  }

  /**
   * Check if request should be shed based on queue depth
   */
  shouldShed(): boolean {
    this.totalRequests++;
    
    // Get current queue depth from bulkheads
    const apiStats = apiBulkhead.getStats();
    const syncStats = syncBulkhead.getStats();
    const totalQueueDepth = apiStats.queued + syncStats.queued;
    
    if (totalQueueDepth > config.LOAD_SHED_QUEUE_MAX) {
      this.shedRequests++;
      return true;
    }
    
    return false;
  }

  /**
   * Get current queue depth
   */
  getQueueDepth(): number {
    const apiStats = apiBulkhead.getStats();
    const syncStats = syncBulkhead.getStats();
    return apiStats.queued + syncStats.queued;
  }

  /**
   * Get load shedding statistics
   */
  getStats(): LoadSheddingStats {
    return {
      name: this.name,
      queueDepth: this.getQueueDepth(),
      maxQueueDepth: config.LOAD_SHED_QUEUE_MAX,
      shedRequests: this.shedRequests,
      totalRequests: this.totalRequests,
    };
  }

  /**
   * Reset statistics
   */
  reset() {
    this.shedRequests = 0;
    this.totalRequests = 0;
    logger.info({ name: this.name }, 'Load shedder reset');
  }
}

// Create load shedder instance
export const loadShedder = new LoadShedder('api');

/**
 * Load shedding middleware
 */
export function loadSheddingMiddleware(req: Request, res: Response, next: NextFunction) {
  if (loadShedder.shouldShed()) {
    const queueDepth = loadShedder.getQueueDepth();
    
    logger.warn({
      req: { id: req.id },
      queueDepth,
      maxQueueDepth: config.LOAD_SHED_QUEUE_MAX,
    }, 'Request shed due to high queue depth');

    // Calculate retry after based on current queue depth
    const retryAfter = Math.min(60, Math.ceil(queueDepth / 10)); // Max 60 seconds
    
    res.status(503).json({
      success: false,
      error: 'SERVICE_OVERLOADED',
      message: 'Service is overloaded, please retry later',
      retryAfter,
    });
    return;
  }

  next();
}

/**
 * Get load shedding statistics
 */
export function getLoadSheddingStats() {
  return loadShedder.getStats();
}
