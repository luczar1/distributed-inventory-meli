import { writeFile, readFile, rm, mkdir } from 'fs/promises';
import { join } from 'path';
import { config } from '../core/config';
import { logger } from '../core/logger';
import { 
  incrementLockAcquired, 
  incrementLockContended, 
  incrementLockStolen, 
  incrementLockExpired, 
  incrementLockLost, 
  incrementLockReleaseFailures 
} from './metrics';
import { lockRegistry } from './lockRegistry';

export type LockHandle = { 
  key: string; 
  file: string; 
  owner: string; 
  expiresAt: number; 
};

interface LockPayload {
  owner: string;
  expiresAt: number;
}

class LockLostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LockLostError';
  }
}

/**
 * Ensure lock directory exists
 */
async function ensureLockDir(): Promise<void> {
  try {
    await mkdir(config.LOCK_DIR, { recursive: true });
  } catch (error) {
    logger.error({ error, lockDir: config.LOCK_DIR }, 'Failed to create lock directory');
    throw new Error(`Failed to create lock directory: ${config.LOCK_DIR}`);
  }
}

/**
 * Get lock file path for a given key
 */
function getLockFilePath(key: string): string {
  return join(config.LOCK_DIR, `${key}.lock`);
}

/**
 * Create lock payload
 */
function createLockPayload(owner: string, ttlMs: number): LockPayload {
  return {
    owner,
    expiresAt: Date.now() + ttlMs
  };
}

/**
 * Read lock file and parse payload
 */
async function readLockFile(filePath: string): Promise<LockPayload | null> {
  try {
    const data = await readFile(filePath, 'utf8');
    const payload = JSON.parse(data) as LockPayload;
    return payload;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null; // File doesn't exist
    }
    // If it's a JSON parse error, treat as non-existent lock
    if (error instanceof SyntaxError) {
      logger.debug({ error, filePath }, 'Malformed lock file, treating as non-existent');
      return null;
    }
    logger.error({ error, filePath }, 'Failed to read lock file');
    throw new Error(`Failed to read lock file: ${filePath}`);
  }
}

/**
 * Write lock file with exclusive create
 */
async function writeLockFile(filePath: string, payload: LockPayload): Promise<void> {
  const data = JSON.stringify(payload);
  await writeFile(filePath, data, { flag: 'wx' }); // Exclusive create
}

/**
 * Handle lock file contention when file already exists
 */
async function handleLockContention(filePath: string, key: string, payload: LockPayload): Promise<LockHandle> {
  const existingPayload = await readLockFile(filePath);
  
  if (!existingPayload) {
    // Malformed or non-existent lock file, try to remove and retry
    return handleMalformedLock(filePath, key, payload);
  }
  
  if (existingPayload.expiresAt < Date.now()) {
    // Lock is expired, try to steal it
    return handleExpiredLock(filePath, key, payload);
  }
  
  // Lock is still valid
  logger.debug({ key, existingOwner: existingPayload.owner, expiresAt: existingPayload.expiresAt }, 'Lock is held by another process');
  incrementLockContended();
  throw new Error(`Lock is held by another process`);
}

/**
 * Handle malformed lock file
 */
async function handleMalformedLock(filePath: string, key: string, payload: LockPayload): Promise<LockHandle> {
  try {
    await rm(filePath, { force: true });
    // Retry exclusive create
    await writeLockFile(filePath, payload);
    logger.debug({ key, owner: payload.owner, expiresAt: payload.expiresAt }, 'Lock acquired after removing malformed file');
    incrementLockAcquired();
    
    const handle = {
      key,
      file: filePath,
      owner: payload.owner,
      expiresAt: payload.expiresAt
    };
    
    // Register the lock for tracking
    lockRegistry.register(handle);
    
    return handle;
  } catch (retryError) {
    // Race condition: another process acquired the lock
    logger.debug({ key, error: retryError }, 'Failed to acquire lock after removing malformed file due to race condition');
    throw new Error(`Lock acquisition failed: race condition during retry`);
  }
}

/**
 * Handle expired lock file
 */
async function handleExpiredLock(filePath: string, key: string, payload: LockPayload): Promise<LockHandle> {
  try {
    await rm(filePath, { force: true });
    // Retry exclusive create
    await writeLockFile(filePath, payload);
    logger.debug({ key, owner: payload.owner, expiresAt: payload.expiresAt }, 'Lock stolen from expired holder');
    incrementLockStolen();
    incrementLockExpired();
    
    const handle = {
      key,
      file: filePath,
      owner: payload.owner,
      expiresAt: payload.expiresAt
    };
    
    // Register the lock for tracking
    lockRegistry.register(handle);
    
    return handle;
  } catch (stealError) {
    // Race condition: another process stole the lock
    logger.debug({ key, error: stealError }, 'Failed to steal expired lock due to race condition');
    throw new Error(`Lock acquisition failed: race condition during steal attempt`);
  }
}

/**
 * Acquire a lock for the given key
 */
export async function acquireLock(key: string, ttlMs: number, owner: string): Promise<LockHandle> {
  await ensureLockDir();
  const filePath = getLockFilePath(key);
  const payload = createLockPayload(owner, ttlMs);
  
  try {
    // Try to create lock file exclusively
    await writeLockFile(filePath, payload);
    logger.debug({ key, owner, expiresAt: payload.expiresAt }, 'Lock acquired');
    incrementLockAcquired();
    
    const handle = {
      key,
      file: filePath,
      owner,
      expiresAt: payload.expiresAt
    };
    
    // Register the lock for tracking
    lockRegistry.register(handle);
    
    return handle;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      // Lock file exists, handle contention
      return handleLockContention(filePath, key, payload);
    }
    throw error;
  }
}

/**
 * Renew a lock with new TTL
 */
export async function renewLock(handle: LockHandle, ttlMs: number): Promise<LockHandle> {
  const payload = await readLockFile(handle.file);
  
  if (!payload) {
    throw new LockLostError('Lock file not found');
  }
  
  if (payload.owner !== handle.owner) {
    incrementLockLost();
    throw new LockLostError('Lock owner mismatch - lock was stolen');
  }
  
  const newPayload = createLockPayload(handle.owner, ttlMs);
  
  try {
    await writeFile(handle.file, JSON.stringify(newPayload), { flag: 'w' });
    logger.debug({ key: handle.key, owner: handle.owner, expiresAt: newPayload.expiresAt }, 'Lock renewed');
    
    return {
      key: handle.key,
      file: handle.file,
      owner: handle.owner,
      expiresAt: newPayload.expiresAt
    };
  } catch (error) {
    logger.error({ error, key: handle.key }, 'Failed to renew lock');
    throw new LockLostError('Failed to renew lock');
  }
}

/**
 * Release a lock
 */
export async function releaseLock(handle: LockHandle): Promise<void> {
  const payload = await readLockFile(handle.file);
  
  if (!payload) {
    logger.debug({ key: handle.key }, 'Lock file not found during release');
    return; // Already released
  }
  
  if (payload.owner !== handle.owner) {
    incrementLockLost();
    throw new LockLostError('Lock owner mismatch - cannot release lock owned by another process');
  }
  
  try {
    await rm(handle.file, { force: true });
    logger.debug({ key: handle.key, owner: handle.owner }, 'Lock released');
    
    // Unregister the lock from tracking
    lockRegistry.unregister(handle);
  } catch (error) {
    logger.error({ error, key: handle.key }, 'Failed to release lock');
    incrementLockReleaseFailures();
    throw new LockLostError('Failed to release lock');
  }
}

/**
 * Check if a lock exists and is valid
 */
export async function isLocked(key: string): Promise<boolean> {
  const filePath = getLockFilePath(key);
  const payload = await readLockFile(filePath);
  
  if (!payload) {
    return false; // No lock file
  }
  
  if (payload.expiresAt < Date.now()) {
    // Lock is expired, try to clean it up
    try {
      await rm(filePath, { force: true });
    } catch (error) {
      // Ignore cleanup errors
      logger.debug({ error, key }, 'Failed to cleanup expired lock file');
    }
    return false; // Expired lock
  }
  
  return true; // Valid lock exists
}

/**
 * Force release a lock (for shutdown scenarios)
 * This bypasses owner verification
 */
export async function forceReleaseLock(key: string): Promise<void> {
  const filePath = getLockFilePath(key);
  try {
    await rm(filePath, { force: true });
    logger.debug({ key }, 'Lock force released');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.debug({ key }, 'Lock file not found during force release');
      return; // File doesn't exist, consider it released
    }
    logger.error({ error, key }, 'Failed to force release lock');
    throw new Error('Failed to force release lock');
  }
}

export { LockLostError };
