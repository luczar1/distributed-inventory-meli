import { startServer, stopServer } from './server-control';
import { logger } from './core/logger';

const PORT = parseInt(process.env['PORT'] || '3000');
const isApiOnly = process.argv.includes('--api-only');

// Start the server
startServer(PORT, isApiOnly).catch((error) => {
  logger.error({ error }, 'Failed to start server');
  process.exit(1);
});

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal: string) {
  logger.info(`${signal} received, starting graceful shutdown`);
  
  try {
    await stopServer();
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Error during graceful shutdown');
    process.exit(1);
  }
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