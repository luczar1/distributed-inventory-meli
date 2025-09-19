import { beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { TestIsolation } from './test-isolation';
import { rm } from 'fs/promises';
import { join } from 'path';

/**
 * Global test setup and teardown
 */
export function setupTestIsolation() {
  let testDataDir: string | null = null;

  beforeEach(async (context) => {
    // Create isolated data directory for each test
    const testName = context.task.name || 'unknown-test';
    console.log(`Setting up test isolation for: ${testName}`);
    testDataDir = await TestIsolation.setupTestData(testName);
    console.log(`Test data directory: ${testDataDir}`);
    console.log(`TEST_DATA_DIR env var: ${process.env.TEST_DATA_DIR}`);
    console.log(`Environment variables:`, Object.keys(process.env).filter(key => key.includes('TEST')));
  });

  afterEach(async () => {
    // Clean up test data directory
    await TestIsolation.cleanupTestData();
    testDataDir = null;
  });

  beforeAll(async () => {
    // Clean up any existing test data directories
    try {
      await rm(join(process.cwd(), 'test-data'), { recursive: true, force: true });
    } catch (error) {
      // Ignore if directory doesn't exist
    }
  });

  afterAll(async () => {
    // Final cleanup of all test data
    try {
      await rm(join(process.cwd(), 'test-data'), { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });
}

/**
 * Manual test isolation for specific tests
 */
export async function withIsolatedTest<T>(
  testName: string,
  testFn: () => Promise<T>
): Promise<T> {
  await TestIsolation.setupTestData(testName);
  try {
    return await testFn();
  } finally {
    await TestIsolation.cleanupTestData();
  }
}

/**
 * Get the current test data directory
 */
export function getTestDataDir(): string | null {
  return TestIsolation.getTestDataDir();
}

// Auto-setup for all tests
console.log('Loading test setup file...');
setupTestIsolation();
console.log('Test setup file loaded');