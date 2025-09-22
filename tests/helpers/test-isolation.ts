import { mkdir, rm, copyFile, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

/**
 * Test isolation utilities to prevent parallel test conflicts
 */
export class TestIsolation {
  private static testDataDir: string | null = null;
  private static originalDataDir: string | null = null;

  /**
   * Set up isolated data directory for a test
   */
  static async setupTestData(testName: string): Promise<string> {
    // Create unique test data directory
    const testId = `${testName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.testDataDir = join(process.cwd(), 'test-data', testId);
    
    // Store original data directory path
    this.originalDataDir = join(process.cwd(), 'data');
    
    // Create test data directory
    await mkdir(this.testDataDir, { recursive: true });
    
    // Copy seed data if it exists
    await this.copySeedData();
    
    // Set environment variable to use test data directory
    process.env.TEST_DATA_DIR = this.testDataDir;
    
    return this.testDataDir;
  }

  /**
   * Clean up test data directory
   */
  static async cleanupTestData(): Promise<void> {
    if (this.testDataDir && existsSync(this.testDataDir)) {
      try {
        await rm(this.testDataDir, { recursive: true, force: true });
      } catch (error) {
        console.warn(`Failed to cleanup test data directory: ${error}`);
      }
    }
    
    // Clear environment variable
    delete process.env.TEST_DATA_DIR;
    
    this.testDataDir = null;
    this.originalDataDir = null;
  }

  /**
   * Copy seed data to test directory
   */
  private static async copySeedData(): Promise<void> {
    if (!this.originalDataDir || !this.testDataDir) return;
    
    const seedFiles = [
      'store-inventory.json',
      'central-inventory.json', 
      'event-log.json',
      'dead-letter.json'
    ];
    
    for (const file of seedFiles) {
      const sourcePath = join(this.originalDataDir, file);
      const targetPath = join(this.testDataDir!, file);
      
      if (existsSync(sourcePath)) {
        try {
          await copyFile(sourcePath, targetPath);
        } catch (error) {
          // If copy fails, create empty file
          if (file === 'store-inventory.json') {
            await writeFile(targetPath, '{}');
          } else if (file === 'central-inventory.json') {
            await writeFile(targetPath, '{}');
          } else if (file === 'event-log.json') {
            await writeFile(targetPath, JSON.stringify({ events: [], lastId: undefined, lastSequence: undefined }));
          } else if (file === 'dead-letter.json') {
            await writeFile(targetPath, '[]');
          }
        }
      } else {
        // Create default empty files
        if (file === 'store-inventory.json') {
          await writeFile(targetPath, '{}');
        } else if (file === 'central-inventory.json') {
          await writeFile(targetPath, '{}');
        } else if (file === 'event-log.json') {
          await writeFile(targetPath, JSON.stringify({ events: [], lastId: undefined, lastSequence: undefined }));
        } else if (file === 'dead-letter.json') {
          await writeFile(targetPath, '[]');
        }
      }
    }
  }

  /**
   * Get the current test data directory
   */
  static getTestDataDir(): string | null {
    return this.testDataDir;
  }

  /**
   * Check if we're in a test environment
   */
  static isTestEnvironment(): boolean {
    return process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
  }
}

/**
 * Test cleanup decorator for automatic cleanup
 */
export function withTestIsolation(testName: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      await TestIsolation.setupTestData(`${testName}-${propertyKey}`);
      try {
        return await originalMethod.apply(this, args);
      } finally {
        await TestIsolation.cleanupTestData();
      }
    };
  };
}
