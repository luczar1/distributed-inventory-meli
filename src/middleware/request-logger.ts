import { Request, Response, NextFunction } from 'express';
import { logger } from '../core/logger';
import { incrementRequests, incrementErrors } from '../utils/metrics';

export const requestLoggerMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  
  // Log request start
  logger.info({
    method: req.method,
    url: req.url,
    requestId: req.id,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
  }, 'Request started');

  // Override res.end to capture response details
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any) {
    const durationMs = Date.now() - startTime;
    
    // Log request completion
    logger.info({
      method: req.method,
      url: req.url,
      status: res.statusCode,
      durationMs,
      requestId: req.id,
      contentLength: res.get('Content-Length'),
    }, 'Request completed');

    // Increment metrics
    incrementRequests();
    if (res.statusCode >= 400) {
      incrementErrors();
    }

    // Call original end
    originalEnd.call(this, chunk, encoding);
  };

  next();
};
