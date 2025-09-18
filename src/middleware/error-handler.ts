import { Request, Response } from 'express';
import { logger } from '../core/logger';
import { DomainError, ErrorFactory } from '../core/errors';
import { z } from 'zod';

export const errorHandler = (error: Error, req: Request, res: Response) => {
  logger.error({ error, req: { id: req.id, method: req.method, url: req.url } }, 'Request error');

  if (error instanceof DomainError) {
    return res.status(error.statusCode).json(ErrorFactory.createErrorResponse(error));
  }

  // Handle Zod validation errors
  if (error instanceof z.ZodError) {
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
  }

  // Handle custom validation errors from middleware
  if ('code' in error && 'statusCode' in error) {
    return res.status((error as any).statusCode).json({
      success: false,
      error: {
        name: (error as any).name,
        message: error.message,
        code: (error as any).code,
        statusCode: (error as any).statusCode,
        timestamp: (error as any).timestamp,
        details: (error as any).details,
      },
    });
  }

  // Generic error - no stack traces in production
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
