import express from 'express';
import { errorHandler } from './middleware/error-handler';
import { requestIdMiddleware } from './middleware/request-id';
import { healthRoutes } from './routes/health.routes';
import { inventoryRoutes } from './routes/inventory.routes';
import { syncRoutes } from './routes/sync.routes';

const app = express();

// Middleware
app.use(express.json());
app.use(requestIdMiddleware);

// Routes
app.use('/api/health', healthRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/sync', syncRoutes);

// Error handling
app.use(errorHandler);

export { app };
