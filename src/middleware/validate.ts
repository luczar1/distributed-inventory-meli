import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';
import { ValidationError } from '../core/errors';

export const validateBody = (schema: ZodSchema) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      // Pass any error to the error handler
      next(error);
    }
  };
};

export const validateParams = (schema: ZodSchema) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.params = schema.parse(req.params);
      next();
    } catch (error) {
      // Pass any error to the error handler
      next(error);
    }
  };
};

export const validateQuery = (schema: ZodSchema) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.query = schema.parse(req.query);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          value: 'received' in err ? err.received : undefined,
        }));
        
        const validationError = new ValidationError(
          `Query validation failed: ${fieldErrors.map(e => `${e.field}: ${e.message}`).join(', ')}`,
          undefined,
          undefined,
          { fieldErrors }
        );
        next(validationError);
        return;
      }
      next(error);
    }
  };
};
