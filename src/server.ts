import { app } from './app';
import { logger } from './core/logger';
import { syncWorker } from './workers/sync.worker';
import { apiBulkhead, syncBulkhead, fileSystemBulkhead } from './utils/bulkhead';
import { getBulkheadMetrics } from './utils/bulkhead';

const PORT = process.env['PORT'] || 3000;
let isShuttingDown = false;

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

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal: string) {
  if (isShuttingDown) {
    logger.warn('Shutdown already in progress, ignoring signal');
    return;
  }

  isShuttingDown = true;
  logger.info(`${signal} received, starting graceful shutdown`);

  try {
    // Stop accepting new requests
    server.close(() => {
      logger.info('Server stopped accepting new connections');
    });

    // Stop sync worker
    logger.info('Stopping sync worker...');
    syncWorker.stopSync();

    // Drain bulkheads and wait for in-flight operations
    logger.info('Draining bulkheads...');
    await drainBulkheads();

    // Run one final sync to ensure no data is lost
    logger.info('Running final sync...');
    try {
      await syncWorker.syncOnce();
      logger.info('Final sync completed successfully');
    } catch (error) {
      logger.error({ error }, 'Final sync failed, but continuing shutdown');
    }

    // Flush logs
    logger.info('Flushing logs...');
    await new Promise(resolve => setTimeout(resolve, 1000)); // Give time for logs to flush

    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Error during graceful shutdown');
    process.exit(1);
  }
}

/**
 * Drain all bulkheads and wait for in-flight operations
 */
async function drainBulkheads(): Promise<void> {
  const maxWaitTime = 30000; // 30 seconds max wait
  const checkInterval = 100; // Check every 100ms
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    const metrics = getBulkheadMetrics();
    const apiStats = metrics.apiBulkhead;
    const syncStats = metrics.syncBulkhead;
    const fsStats = metrics.fileSystemBulkhead;

    const totalActive = apiStats.active + syncStats.active + fsStats.active;
    const totalQueued = apiStats.queued + syncStats.queued + fsStats.queued;

    if (totalActive === 0 && totalQueued === 0) {
      logger.info('All bulkheads drained successfully');
      return;
    }

    logger.info({
      api: { active: apiStats.active, queued: apiStats.queued },
      sync: { active: syncStats.active, queued: syncStats.queued },
      filesystem: { active: fsStats.active, queued: fsStats.queued },
      totalActive,
      totalQueued,
    }, 'Waiting for bulkheads to drain...');

    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }

  logger.warn('Bulkhead drain timeout reached, forcing shutdown');
}

// Graceful shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error({ error }, 'Uncaught exception, shutting down');
  gracefulShutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled promise rejection, shutting down');
  gracefulShutdown('unhandledRejection');
});