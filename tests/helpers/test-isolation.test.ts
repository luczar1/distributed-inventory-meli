import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestIsolation } from './test-isolation';
import { existsSync } from 'fs';
import { join } from 'path';

describe('Test Isolation', () => {
  beforeEach(async () => {
    // Clean up any existing test data
    await TestIsolation.cleanupTestData();
  });

  afterEach(async () => {
    // Clean up test data
    await TestIsolation.cleanupTestData();
  });

  it('should create test data directory', async () => {
    const testName = 'test-isolation-test';
    const testDataDir = await TestIsolation.setupTestData(testName);
    
    expect(testDataDir).toBeDefined();
    expect(existsSync(testDataDir)).toBe(true);
    expect(process.env.TEST_DATA_DIR).toBe(testDataDir);
    
    // Check if event log file exists
    const eventLogPath = join(testDataDir, 'event-log.json');
    expect(existsSync(eventLogPath)).toBe(true);
    
    // Check if store inventory file exists
    const storeInventoryPath = join(testDataDir, 'store-inventory.json');
    expect(existsSync(storeInventoryPath)).toBe(true);
  });

  it('should clean up test data directory', async () => {
    const testName = 'test-cleanup-test';
    const testDataDir = await TestIsolation.setupTestData(testName);
    
    expect(existsSync(testDataDir)).toBe(true);
    
    await TestIsolation.cleanupTestData();
    
    expect(existsSync(testDataDir)).toBe(false);
    expect(process.env.TEST_DATA_DIR).toBeUndefined();
  });
});
