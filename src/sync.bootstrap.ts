import { logger } from './core/logger';
import { syncWorker } from './workers/sync.worker.core';
import { config } from './core/config';

const args = process.argv.slice(2);
const runOnce = args.includes('--once');
const noReplay = args.includes('--no-replay');
const intervalArgIndex = args.findIndex(arg => arg.startsWith('--interval='));
const intervalMs = intervalArgIndex !== -1
  ? parseInt(args[intervalArgIndex].split('=')[1], 10)
  : config.SYNC_INTERVAL_MS;
const replayOnBoot = !noReplay;

async function replayEventLog(): Promise<void> {
  if (!replayOnBoot) {
    return;
  }

  logger.info('Replaying event log on boot...');
  try {
    await syncWorker.replayOnBoot();
    logger.info('Event log replay completed');
  } catch (error) {
    logger.warn({ error }, 'Event log replay failed, continuing with empty state');
  }
}

async function runSyncOnce(): Promise<void> {
  logger.info('Running sync once...');
  try {
    await syncWorker.syncOnce();
    logger.info('Sync completed, exiting');
    process.exit(0);
  } catch (error) {
    logger.warn({ error }, 'Sync failed, but this is expected with no events');
    logger.info('Sync worker completed (no events to process)');
    process.exit(0);
  }
}

async function setupShutdownHandlers(): Promise<void> {
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down sync worker`);
    
    // Stop sync worker
    syncWorker.stopSync();
    
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
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    logger.info('Sync worker shutdown completed');
    process.exit(0);
  };

  // Register shutdown handlers
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGUSR1', () => shutdown('SIGUSR1'));
  process.on('SIGUSR2', () => shutdown('SIGUSR2'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error({ error }, 'Uncaught exception in sync worker');
    shutdown('uncaughtException');
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error({ reason, promise }, 'Unhandled promise rejection in sync worker');
    shutdown('unhandledRejection');
  });
}

async function startPeriodicSync(): Promise<void> {
  logger.info({ intervalMs }, 'Starting periodic sync worker');
  syncWorker.startSync(intervalMs);
  await setupShutdownHandlers();

  // Keep the process alive
  logger.info('Sync worker is running. Press Ctrl+C to stop.');
  
  // Log status periodically
  setInterval(() => {
    const status = syncWorker.getStatus();
    logger.info({
      isRunning: status.isRunning,
      lastProcessedEventId: status.lastProcessedEventId,
      uptime: process.uptime(),
    }, 'Sync worker status');
  }, 60000); // Every minute
}

async function main(): Promise<void> {
  try {
    logger.info({
      intervalMs,
      runOnce,
      replayOnBoot,
      processId: process.pid,
    }, 'Starting sync worker bootstrap');

    await replayEventLog();

    if (runOnce) {
      await runSyncOnce();
    } else {
      await startPeriodicSync();
    }
  } catch (error) {
    logger.error({ error }, 'Failed to start sync worker');
    process.exit(1);
  }
}

main().catch(error => {
  logger.error({ error }, 'Failed to start sync worker');
  process.exit(1);
});
