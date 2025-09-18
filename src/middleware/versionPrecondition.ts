import { Request, Response, NextFunction } from 'express';
import { ConflictError } from '../core/errors';
import { logger } from '../core/logger';

/**
 * Extract version from If-Match header
 */
export function extractVersionFromIfMatch(ifMatch: string | undefined): number | undefined {
  if (!ifMatch) {
    return undefined;
  }

  // Remove W/ prefix and quotes if present (ETag format: W/"version" or "version")
  const cleanVersion = ifMatch.replace(/^W\//, '').replace(/"/g, '');
  const version = parseInt(cleanVersion, 10);
  
  if (isNaN(version) || version < 1) {
    throw new Error('Invalid If-Match header format');
  }
  
  return version;
}

/**
 * Check version precondition (If-Match header vs current version)
 */
export function checkVersionPrecondition(
  currentVersion: number,
  ifMatchVersion?: number,
  bodyVersion?: number
): void {
  // Use If-Match header if present, otherwise fall back to body
  const expectedVersion = ifMatchVersion ?? bodyVersion;
  
  if (expectedVersion !== undefined && currentVersion !== expectedVersion) {
    throw ConflictError.versionMismatch(
      'unknown', // Will be filled by caller
      'unknown', // Will be filled by caller
      expectedVersion,
      currentVersion
    );
  }
}

/**
 * Middleware to handle If-Match header validation
 */
export function ifMatchMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const ifMatch = req.headers['if-match'] as string;
    logger.info({ reqId: req.id, ifMatch, path: req.path }, 'If-Match middleware processing');
    
    if (ifMatch) {
      const version = extractVersionFromIfMatch(ifMatch);
      // Store in request for later use
      (req as any).ifMatchVersion = version;
      logger.info({ reqId: req.id, version }, 'If-Match version extracted');
    } else {
      // No If-Match header, continue without version check
      (req as any).ifMatchVersion = undefined;
    }
    
    next();
  } catch (error) {
    logger.warn({
      req: { id: req.id },
      ifMatch: req.headers['if-match'],
      error: (error as Error).message
    }, 'Invalid If-Match header');
    
    res.status(400).json({
      success: false,
      error: {
        name: 'BadRequestError',
        message: 'Invalid If-Match header format',
        code: 'INVALID_IF_MATCH',
        statusCode: 400,
        timestamp: new Date().toISOString(),
      },
    });
  }
}
