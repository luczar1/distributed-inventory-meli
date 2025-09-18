import express from 'express';
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

// Routes
app.use('/api/health', healthRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/metrics', metricsRoutes);

// Error handling
app.use(errorHandler);

export { app };
