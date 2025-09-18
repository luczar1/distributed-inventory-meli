/**
 * Persistence Service
 * Handles JSON file persistence with fault tolerance and retry mechanisms
 */
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class PersistenceService {
  constructor(dataDir = './data') {
    this.dataDir = dataDir;
    this.maxRetries = 3;
    this.retryDelay = 100; // milliseconds
  }

  /**
   * Ensure data directory exists
   */
  async ensureDataDir() {
    try {
      await fs.access(this.dataDir);
    } catch {
      await fs.mkdir(this.dataDir, { recursive: true });
      logger.info(`Created data directory: ${this.dataDir}`);
    }
  }

  /**
   * Retry mechanism for file operations
   * @param {Function} operation - Operation to retry
   * @param {string} operationName - Name of operation for logging
   * @returns {Promise<any>}
   */
  async withRetry(operation, operationName) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        logger.warn(`${operationName} attempt ${attempt} failed:`, error.message);
        
        if (attempt < this.maxRetries) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw new Error(`${operationName} failed after ${this.maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Write data to file with atomic operation
   * @param {string} filename - File name
   * @param {Object} data - Data to write
   * @returns {Promise<void>}
   */
  async writeFile(filename, data) {
    await this.ensureDataDir();
    const filePath = path.join(this.dataDir, filename);
    const tempPath = `${filePath}.tmp`;
    
    return await this.withRetry(async () => {
      // Write to temporary file first
      await fs.writeFile(tempPath, JSON.stringify(data, null, 2));
      
      // Atomic move
      await fs.rename(tempPath, filePath);
      
      logger.debug(`Successfully wrote to ${filename}`);
    }, `Write file ${filename}`);
  }

  /**
   * Read data from file
   * @param {string} filename - File name
   * @param {any} defaultValue - Default value if file doesn't exist
   * @returns {Promise<any>}
   */
  async readFile(filename, defaultValue = null) {
    await this.ensureDataDir();
    const filePath = path.join(this.dataDir, filename);
    
    return await this.withRetry(async () => {
      try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
      } catch (error) {
        if (error.code === 'ENOENT') {
          logger.debug(`File ${filename} does not exist, using default value`);
          return defaultValue;
        }
        throw error;
      }
    }, `Read file ${filename}`);
  }

  /**
   * Check if file exists
   * @param {string} filename - File name
   * @returns {Promise<boolean>}
   */
  async fileExists(filename) {
    try {
      const filePath = path.join(this.dataDir, filename);
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete file
   * @param {string} filename - File name
   * @returns {Promise<void>}
   */
  async deleteFile(filename) {
    await this.ensureDataDir();
    const filePath = path.join(this.dataDir, filename);
    
    return await this.withRetry(async () => {
      try {
        await fs.unlink(filePath);
        logger.debug(`Successfully deleted ${filename}`);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    }, `Delete file ${filename}`);
  }

  /**
   * List files in data directory
   * @param {string} pattern - File pattern (optional)
   * @returns {Promise<string[]>}
   */
  async listFiles(pattern = null) {
    await this.ensureDataDir();
    
    try {
      const files = await fs.readdir(this.dataDir);
      return pattern 
        ? files.filter(file => file.includes(pattern))
        : files;
    } catch (error) {
      logger.error('Error listing files:', error);
      return [];
    }
  }

  /**
   * Backup file
   * @param {string} filename - File name
   * @returns {Promise<string>} - Backup filename
   */
  async backupFile(filename) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFilename = `${filename}.backup.${timestamp}`;
    
    const data = await this.readFile(filename);
    if (data !== null) {
      await this.writeFile(backupFilename, data);
      logger.info(`Created backup: ${backupFilename}`);
    }
    
    return backupFilename;
  }

  /**
   * Get file statistics
   * @param {string} filename - File name
   * @returns {Promise<Object>}
   */
  async getFileStats(filename) {
    try {
      const filePath = path.join(this.dataDir, filename);
      const stats = await fs.stat(filePath);
      return {
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        exists: true
      };
    } catch (error) {
      return {
        exists: false,
        error: error.message
      };
    }
  }
}

module.exports = PersistenceService;
