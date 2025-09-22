import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { randomUUID } from 'crypto';
import { logger } from '../core/logger';
import { config } from '../core/config';
import { fileSystemBreaker } from './circuitBreaker';
import { fileSystemBulkhead } from './bulkhead';
import { random } from '../testing/rng';

// Sleep utility
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Exponential backoff with jitter
function getDelayWithJitter(attempt: number): number {
  const baseDelay = config.RETRY_BASE_MS * Math.pow(2, attempt - 1);
  const jitterMs = config.RETRY_JITTER_MS || 0;
  const jitter = random() * jitterMs;
  return Math.floor(baseDelay + jitter);
}

// Generic retry wrapper with exponential backoff and jitter
export async function withFsRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  context: Record<string, unknown> = {}
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= config.RETRY_TIMES + 1; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      logger.warn({ 
        ...context,
        operationName,
        attempt, 
        error: lastError.message 
      }, `${operationName} attempt failed`);
      
      if (attempt <= config.RETRY_TIMES) {
        const delay = getDelayWithJitter(attempt);
        logger.info({ ...context, operationName, attempt, delay }, `Retrying ${operationName}`);
        await sleep(delay);
      }
    }
  }
  
  logger.error({ ...context, operationName, attempts: config.RETRY_TIMES + 1 }, `${operationName} failed after all retries`);
  throw new Error(`${operationName} failed after ${config.RETRY_TIMES + 1} attempts: ${lastError?.message}`);
}

// Safe JSON file read with retry, circuit breaker, and bulkhead
export async function readJsonFile<T = unknown>(filePath: string): Promise<T> {
  return fileSystemBulkhead.run(async () => {
    return fileSystemBreaker.execute(async () => {
      return withFsRetry(
        async () => {
          const data = await fs.readFile(filePath, 'utf8');
          return JSON.parse(data);
        },
        'File read',
        { filePath }
      );
    });
  });
}

// Atomic JSON file write with retry, circuit breaker, and bulkhead
export async function writeJsonAtomic<T = unknown>(filePath: string, data: T): Promise<void> {
  return fileSystemBulkhead.run(async () => {
    return fileSystemBreaker.execute(async () => {
      return withFsRetry(
        async () => {
          const jsonData = JSON.stringify(data, null, 2);
          const tempPath = join(dirname(filePath), `.${randomUUID()}.tmp`);
          
          try {
            // Write to temporary file first
            await fs.writeFile(tempPath, jsonData, 'utf8');
            
            // Atomic rename (this is atomic on most filesystems)
            await fs.rename(tempPath, filePath);
            
            logger.debug({ filePath }, 'File written atomically');
          } catch (error) {
            // Clean up temp file if it exists
            try {
              await fs.unlink(tempPath);
            } catch {
              // Ignore cleanup errors
            }
            throw error;
          }
        },
        'Atomic file write',
        { filePath }
      );
    });
  });
}

// Safe JSON file write with retry, circuit breaker, and bulkhead (legacy, use writeJsonAtomic for new code)
export async function writeJsonFile<T = unknown>(filePath: string, data: T): Promise<void> {
  return fileSystemBulkhead.run(async () => {
    return fileSystemBreaker.execute(async () => {
      return withFsRetry(
        async () => {
          const jsonData = JSON.stringify(data, null, 2);
          await fs.writeFile(filePath, jsonData, 'utf8');
          logger.debug({ filePath }, 'File written successfully');
        },
        'File write',
        { filePath }
      );
    });
  });
}

// Safe file exists check with circuit breaker and bulkhead
export async function fileExists(filePath: string): Promise<boolean> {
  return fileSystemBulkhead.run(async () => {
    return fileSystemBreaker.execute(async () => {
      return withFsRetry(
        async () => {
          await fs.access(filePath);
          return true;
        },
        'File exists check',
        { filePath }
      );
    });
  }).catch(() => false); // If access fails after retries, file doesn't exist
}

// Safe directory creation with circuit breaker and bulkhead
export async function ensureDir(dirPath: string): Promise<void> {
  return fileSystemBulkhead.run(async () => {
    return fileSystemBreaker.execute(async () => {
      return withFsRetry(
        async () => {
          await fs.mkdir(dirPath, { recursive: true });
        },
        'Directory creation',
        { dirPath }
      );
    });
  });
}

// Safe file deletion with circuit breaker and bulkhead
export async function deleteFile(filePath: string): Promise<void> {
  return fileSystemBulkhead.run(async () => {
    return fileSystemBreaker.execute(async () => {
      return withFsRetry(
        async () => {
          await fs.unlink(filePath);
          logger.debug({ filePath }, 'File deleted successfully');
        },
        'File deletion',
        { filePath }
      );
    });
  });
}
