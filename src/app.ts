import express, { Request, Response, NextFunction } from 'express';
import { errorHandler } from './middleware/error-handler';
import { requestIdMiddleware } from './middleware/request-id';
import { requestLoggerMiddleware } from './middleware/request-logger';
import { healthRoutes } from './routes/health.routes';
import { inventoryRoutes } from './routes/inventory.routes';
import { syncRoutes } from './routes/sync.routes';
import { metricsRoutes } from './routes/metrics.routes';

const app = express();

// Middleware
app.use(express.json());
app.use(requestIdMiddleware);
app.use(requestLoggerMiddleware);

// Custom JSON error handler
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  if (error instanceof SyntaxError && 'body' in error) {
    // JSON parse error
    return res.status(500).json({
      success: false,
      error: {
        name: 'InternalServerError',
        message: 'Internal server error',
        code: 'INTERNAL_SERVER_ERROR',
        statusCode: 500,
        timestamp: new Date().toISOString(),
      },
    });
  }
  next(error);
});

// Routes
app.use('/api/health', healthRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/metrics', metricsRoutes);

// 404 handler for unknown routes
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      name: 'NotFoundError',
      message: 'Route not found',
      code: 'NOT_FOUND',
      statusCode: 404,
      timestamp: new Date().toISOString(),
    },
  });
});

// Error handling
app.use(errorHandler);

export { app };
