import { app } from './app';
import { logger } from './core/logger';
import { syncWorker } from './workers/sync.worker';

const PORT = process.env['PORT'] || 3000;

const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  
  // Start sync worker with 15 second interval
  syncWorker.startSync(15000);
  logger.info('Sync worker started with 15 second interval');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  syncWorker.stopSync();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  syncWorker.stopSync();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});