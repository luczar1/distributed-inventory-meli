import { Request, Response } from 'express';
import { logger } from '../core/logger';
import { DomainError, ErrorFactory } from '../core/errors';

export const errorHandler = (error: Error, req: Request, res: Response) => {
  logger.error({ error, req: { id: req.id, method: req.method, url: req.url } }, 'Request error');

  if (error instanceof DomainError) {
    return res.status(error.statusCode).json(ErrorFactory.createErrorResponse(error));
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
