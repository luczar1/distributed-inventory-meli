import { app } from './app';
import { logger } from './core/logger';
import { syncWorker } from './workers/sync.worker';

const PORT = process.env['PORT'] || 3000;

const server = app.listen(PORT, async () => {
  logger.info(`Server running on port ${PORT}`);
  
  // Replay event log on boot to ensure consistency
  try {
    await syncWorker.replayOnBoot();
    logger.info('Event log replay completed');
  } catch (error) {
    logger.error({ error }, 'Failed to replay event log on boot');
  }
  
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