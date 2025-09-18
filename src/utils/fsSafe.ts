import { promises as fs } from 'fs';
import { logger } from '../core/logger';

// Retry configuration
const MAX_RETRIES = 3;
const BASE_DELAY = 100; // 100ms base delay

// Exponential backoff delay calculation
function getDelay(attempt: number): number {
  return BASE_DELAY * Math.pow(2, attempt - 1);
}

// Sleep utility
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Safe JSON file read with retry
export async function readJsonFile<T = unknown>(filePath: string): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      lastError = error as Error;
      logger.warn({ 
        filePath, 
        attempt, 
        error: lastError.message 
      }, 'File read attempt failed');
      
      if (attempt < MAX_RETRIES) {
        const delay = getDelay(attempt);
        logger.info({ filePath, attempt, delay }, 'Retrying file read');
        await sleep(delay);
      }
    }
  }
  
  logger.error({ filePath, attempts: MAX_RETRIES }, 'File read failed after all retries');
  throw new Error(`Failed to read file ${filePath} after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

// Safe JSON file write with retry
export async function writeJsonFile<T = unknown>(filePath: string, data: T): Promise<void> {
  let lastError: Error | null = null;
  const jsonData = JSON.stringify(data, null, 2);
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await fs.writeFile(filePath, jsonData, 'utf8');
      logger.debug({ filePath }, 'File written successfully');
      return;
    } catch (error) {
      lastError = error as Error;
      logger.warn({ 
        filePath, 
        attempt, 
        error: lastError.message 
      }, 'File write attempt failed');
      
      if (attempt < MAX_RETRIES) {
        const delay = getDelay(attempt);
        logger.info({ filePath, attempt, delay }, 'Retrying file write');
        await sleep(delay);
      }
    }
  }
  
  logger.error({ filePath, attempts: MAX_RETRIES }, 'File write failed after all retries');
  throw new Error(`Failed to write file ${filePath} after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

// Safe file exists check
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Safe directory creation
export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    logger.error({ dirPath, error }, 'Failed to create directory');
    throw error;
  }
}

// Safe file deletion
export async function deleteFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
    logger.debug({ filePath }, 'File deleted successfully');
  } catch (error) {
    logger.error({ filePath, error }, 'Failed to delete file');
    throw error;
  }
}
