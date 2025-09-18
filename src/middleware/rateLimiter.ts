import { Request, Response, NextFunction } from 'express';
import { logger } from '../core/logger';
import { config } from '../core/config';

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

interface RateLimiterOptions {
  name: string;
  rps: number;
  burst: number;
  windowMs?: number;
}

export class RateLimiter {
  private buckets = new Map<string, TokenBucket>();
  private requests = 0;
  private rejected = 0;

  constructor(private options: RateLimiterOptions) {
    logger.info({
      name: options.name,
      rps: options.rps,
      burst: options.burst,
    }, 'Rate limiter created');
  }

  /**
   * Check if request should be allowed
   */
  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const bucket = this.getBucket(identifier);
    
    // Refill tokens based on time elapsed
    const timeElapsed = now - bucket.lastRefill;
    const tokensToAdd = (timeElapsed / 1000) * this.options.rps;
    
    bucket.tokens = Math.min(
      this.options.burst,
      bucket.tokens + tokensToAdd
    );
    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      this.requests++;
      return true;
    }

    this.rejected++;
    return false;
  }

  /**
   * Get or create bucket for identifier
   */
  private getBucket(identifier: string): TokenBucket {
    if (!this.buckets.has(identifier)) {
      this.buckets.set(identifier, {
        tokens: this.options.burst,
        lastRefill: Date.now(),
      });
    }
    return this.buckets.get(identifier)!;
  }

  /**
   * Get current statistics
   */
  getStats() {
    return {
      name: this.options.name,
      requests: this.requests,
      rejected: this.rejected,
      buckets: this.buckets.size,
      rps: this.options.rps,
      burst: this.options.burst,
    };
  }

  /**
   * Reset statistics
   */
  reset() {
    this.requests = 0;
    this.rejected = 0;
    this.buckets.clear();
    logger.info({ name: this.options.name }, 'Rate limiter reset');
  }

  /**
   * Clean up old buckets (optional optimization)
   */
  cleanup(maxAge: number = 300000) { // 5 minutes
    const now = Date.now();
    for (const [key, bucket] of this.buckets.entries()) {
      if (now - bucket.lastRefill > maxAge) {
        this.buckets.delete(key);
      }
    }
  }
}

// Create rate limiter instance
export const rateLimiter = new RateLimiter({
  name: 'api',
  rps: config.RATE_LIMIT_RPS,
  burst: config.RATE_LIMIT_BURST,
});

/**
 * Rate limiting middleware
 */
export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  // Use IP address as identifier (in production, consider user ID or API key)
  const identifier = req.ip || req.connection.remoteAddress || 'unknown';
  
  if (!rateLimiter.isAllowed(identifier)) {
    logger.warn({
      req: { id: req.id },
      identifier,
      rps: config.RATE_LIMIT_RPS,
      burst: config.RATE_LIMIT_BURST,
    }, 'Request rate limited');

    res.status(429).json({
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests',
      retryAfter: Math.ceil(1000 / config.RATE_LIMIT_RPS), // seconds
    });
    return;
  }

  next();
}

/**
 * Get rate limiter statistics
 */
export function getRateLimiterStats() {
  return rateLimiter.getStats();
}
