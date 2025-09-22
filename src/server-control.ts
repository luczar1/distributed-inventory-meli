import { Server } from 'http';
import { app } from './app';
import { logger } from './core/logger';
import { syncWorker } from './workers/sync.worker';
import { getBulkheadMetrics } from './utils/bulkhead';
import { lockRegistry } from './utils/lockRegistry';
import { forceReleaseLock } from './utils/lockFile';

let server: Server | null = null;
let isShuttingDown = false;
let isStarted = false;

/**
 * Start the server with graceful shutdown capabilities
 */
export async function startServer(port: number = 3000, isApiOnly: boolean = false): Promise<Server> {
  if (isStarted) {
    throw new Error('Server is already started');
  }

  return new Promise((resolve, reject) => {
    server = app.listen(port, async () => {
      logger.info(`Server running on port ${port}${isApiOnly ? ' (API only mode)' : ''}`);
      isStarted = true;
      
      if (!isApiOnly) {
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
      } else {
        logger.info('Running in API-only mode (sync worker disabled)');
      }
      
      resolve(server!);
    });

    server.on('error', (error) => {
      logger.error({ error }, 'Server error');
      reject(error);
    });
  });
}

/**
 * Stop the server gracefully
 */
export async function stopServer(): Promise<void> {
  if (!isStarted || isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logger.info('Starting graceful shutdown');

  return new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }

    // Stop accepting new requests
    server.close(async () => {
      logger.info('Server stopped accepting new connections');

      try {
        // Stop sync worker
        logger.info('Stopping sync worker...');
        syncWorker.stopSync();

        // Release all active locks
        logger.info('Releasing active locks...');
        await releaseActiveLocks();

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
        isStarted = false;
        isShuttingDown = false;
        server = null;
        resolve();
      } catch (error) {
        logger.error({ error }, 'Error during graceful shutdown');
        isStarted = false;
        isShuttingDown = false;
        server = null;
        resolve();
      }
    });
  });
}

/**
 * Check if server is currently running
 */
export function isServerRunning(): boolean {
  return isStarted && !isShuttingDown;
}

/**
 * Check if server is shutting down
 */
export function isServerShuttingDown(): boolean {
  return isShuttingDown;
}

/**
 * Release all active locks during shutdown
 */
async function releaseActiveLocks(): Promise<void> {
  const activeLocks = lockRegistry.getActiveLocks();
  
  if (activeLocks.length === 0) {
    logger.info('No active locks to release');
    return;
  }

  logger.info({ lockCount: activeLocks.length }, 'Releasing active locks');

  // Release all locks in parallel, ignoring LOCK_LOST errors
  const releasePromises = activeLocks.map(async (handle) => {
    try {
      await forceReleaseLock(handle.key);
      logger.debug({ key: handle.key }, 'Lock forcefully released during shutdown');
    } catch (error) {
      // Ignore LOCK_LOST errors during shutdown
      if (error instanceof Error && error.message.includes('LOCK_LOST')) {
        logger.debug({ key: handle.key }, 'Lock already released or lost during shutdown');
      } else {
        logger.warn({ error, key: handle.key }, 'Failed to forcefully release lock during shutdown');
      }
    }
  });

  await Promise.allSettled(releasePromises);
  logger.info('Active locks release completed');
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
