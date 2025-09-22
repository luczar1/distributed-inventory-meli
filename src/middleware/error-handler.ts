import { Request, Response, NextFunction } from 'express';
import { logger } from '../core/logger';
import { DomainError, ErrorFactory, LockRejectionError } from '../core/errors';
import { z } from 'zod';

interface ErrorWithCode {
  code: string;
  statusCode: number;
  name: string;
  timestamp?: string;
  details?: unknown;
}

const handleLockRejectionError = (error: LockRejectionError, res: Response) => {
  res.set('Retry-After', error.retryAfter.toString());
  res.set('X-Lock-Key', error.sku);
  return res.status(503).json({
    success: false,
    error: {
      name: error.name,
      message: error.message,
      code: 'LOCK_REJECTION_ERROR',
      statusCode: 503,
      timestamp: new Date().toISOString(),
      details: { sku: error.sku, retryAfter: error.retryAfter }
    },
  });
};

const handleZodValidationError = (error: z.ZodError, res: Response) => {
  const fieldErrors = error.errors.map(err => ({
    field: err.path.join('.'),
    message: err.message,
    value: 'received' in err ? err.received : undefined,
  }));
  
  return res.status(400).json({
    success: false,
    error: {
      name: 'ValidationError',
      message: `Validation failed: ${fieldErrors.map(e => `${e.field}: ${e.message}`).join(', ')}`,
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      timestamp: new Date().toISOString(),
      details: { fieldErrors }
    },
  });
};

const handleCustomError = (error: Error & ErrorWithCode, res: Response) => {
  return res.status(error.statusCode).json({
    success: false,
    error: {
      name: error.name,
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      timestamp: error.timestamp,
      details: error.details,
    },
  });
};

const handleGenericError = (error: Error, res: Response) => {
  const isDevelopment = process.env['NODE_ENV'] === 'development';
  return res.status(500).json({
    success: false,
    error: {
      name: 'InternalServerError',
      message: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR',
      statusCode: 500,
      timestamp: new Date().toISOString(),
      ...(isDevelopment && { stack: error.stack }),
    },
  });
};

export const errorHandler = (error: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error({ error, req: { id: req.id, method: req.method, url: req.url } }, 'Request error');

  if (error instanceof LockRejectionError) {
    return handleLockRejectionError(error, res);
  }

  if (error instanceof DomainError) {
    return res.status(error.statusCode).json(ErrorFactory.createErrorResponse(error));
  }

  if (error instanceof z.ZodError) {
    return handleZodValidationError(error, res);
  }

  if ('code' in error && 'statusCode' in error) {
    return handleCustomError(error as Error & ErrorWithCode, res);
  }

  return handleGenericError(error, res);
};