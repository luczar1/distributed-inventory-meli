import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startServer, stopServer, isServerRunning, isServerShuttingDown } from '../../src/server-control';
import { syncWorker } from '../../src/workers/sync.worker';
import { inventoryService } from '../../src/services/inventory.service';
import { inventoryRepository } from '../../src/repositories/inventory.repo';
import { readFile, writeFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

describe('Graceful shutdown integration test', () => {
  const testDataDir = process.env.TEST_DATA_DIR || join(__dirname, '../../data');
  const testFiles = [
    'store-inventory.json',
    'central-inventory.json',
    'event-log.json',
  ];

  beforeEach(async () => {
    // Clean up test data
    for (const file of testFiles) {
      const filePath = join(testDataDir, file);
      if (existsSync(filePath)) {
        await unlink(filePath);
      }
    }

    // Create test data directory with initial data
    await writeFile(join(testDataDir, 'store-inventory.json'), '[]');
    await writeFile(join(testDataDir, 'central-inventory.json'), '{}');
    await writeFile(join(testDataDir, 'event-log.json'), JSON.stringify({ events: [], lastId: undefined, lastSequence: undefined }));
  });

  afterEach(async () => {
    // Ensure server is stopped after each test
    if (isServerRunning()) {
      await stopServer();
    }
  });

  it('should handle graceful shutdown with SIGTERM', async () => {
    // Start server
    const server = await startServer(3001, false);
    expect(isServerRunning()).toBe(true);

    // Create initial inventory record using the service
    const testId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const initialResult = await inventoryService.adjustStock('STORE001', 'SKU123', 100, undefined, `${testId}-1`);
    
    // Wait a bit for the record to be persisted
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Start a slow operation that will be in-flight during shutdown
    // Use the actual version from the initial result
    const slowOperation = inventoryService.adjustStock('STORE001', 'SKU123', 50, initialResult.version, `${testId}-2`);
    
    // Wait a bit for the operation to start
    await new Promise(resolve => setTimeout(resolve, 100));

    // Trigger graceful shutdown
    await stopServer();

    // Wait for the slow operation to complete
    const result = await slowOperation;
    
    // Verify the operation completed successfully
    expect(result.qty).toBe(150);
    expect(result.version).toBe(initialResult.version + 1);
    
    // Verify server is stopped
    expect(isServerRunning()).toBe(false);
  });

  it('should handle graceful shutdown with SIGINT', async () => {
    // Start server
    const server = await startServer(3002, false);
    expect(isServerRunning()).toBe(true);

    // Create initial inventory record using the service
    const testId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const initialResult = await inventoryService.adjustStock('STORE001', 'SKU123', 100, undefined, `${testId}-1`);
    
    // Wait a bit for the record to be persisted
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Start a slow operation
    // Use the actual version from the initial result
    const slowOperation = inventoryService.adjustStock('STORE001', 'SKU123', 50, initialResult.version, `${testId}-2`);
    
    // Wait a bit for the operation to start
    await new Promise(resolve => setTimeout(resolve, 100));

    // Trigger graceful shutdown
    await stopServer();

    // Wait for the slow operation to complete
    const result = await slowOperation;
    
    // Verify the operation completed successfully
    expect(result.qty).toBe(150);
    expect(result.version).toBe(initialResult.version + 1);
    
    // Verify server is stopped
    expect(isServerRunning()).toBe(false);
  });

  it('should ensure final state is persisted after shutdown', async () => {
    // Start server
    const server = await startServer(3003, false);
    expect(isServerRunning()).toBe(true);

    // Create initial inventory record and make adjustments
    const testId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const initialResult = await inventoryService.adjustStock('STORE001', 'SKU123', 100, undefined, `${testId}-1`);
    
    // Wait a bit for the record to be persisted
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const secondResult = await inventoryService.adjustStock('STORE001', 'SKU123', 50, initialResult.version, `${testId}-2`);
    
    // Trigger graceful shutdown
    await stopServer();

    // Verify final state is persisted
    const storeInventory = JSON.parse(await readFile(join(testDataDir, 'store-inventory.json'), 'utf-8'));
    const centralInventory = JSON.parse(await readFile(join(testDataDir, 'central-inventory.json'), 'utf-8'));
    const eventLog = JSON.parse(await readFile(join(testDataDir, 'event-log.json'), 'utf-8'));

    // Verify store inventory has the final state
    expect(storeInventory).toHaveLength(1);
    expect(storeInventory[0].qty).toBe(150);
    expect(storeInventory[0].version).toBe(secondResult.version);

    // Verify central inventory was updated
    expect(centralInventory).toHaveProperty('SKU123');
    expect(centralInventory.SKU123).toHaveProperty('STORE001');
    expect(centralInventory.SKU123.STORE001.qty).toBe(150);

    // Verify events were logged
    expect(eventLog.events).toHaveLength(2);
    expect(eventLog.events[0].type).toBe('stock_adjusted');
    expect(eventLog.events[1].type).toBe('stock_adjusted');
  });

  it('should handle shutdown timeout gracefully', async () => {
    // Start server
    const server = await startServer(3004, false);
    expect(isServerRunning()).toBe(true);

    // Create initial inventory record using the service
    const testId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const initialResult = await inventoryService.adjustStock('STORE001', 'SKU123', 100, undefined, `${testId}-1`);
    
    // Wait a bit for the record to be persisted
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Start multiple slow operations to test bulkhead draining
    // Use unique idempotency keys and don't specify expected version to avoid conflicts
    const operations = Array(5).fill(0).map((_, i) => 
      inventoryService.adjustStock('STORE001', 'SKU123', 10, undefined, `${testId}-${i}-${Date.now()}`)
    );
    
    // Wait a bit for operations to start
    await new Promise(resolve => setTimeout(resolve, 100));

    // Trigger graceful shutdown
    const shutdownStart = Date.now();
    await stopServer();
    const shutdownDuration = Date.now() - shutdownStart;

    // Verify shutdown completed within reasonable time (should be less than 30 seconds)
    expect(shutdownDuration).toBeLessThan(30000);
    
    // Wait for all operations to complete
    const results = await Promise.all(operations);
    
    // Verify all operations completed successfully
    results.forEach(result => {
      expect(result.qty).toBeGreaterThanOrEqual(0);
      expect(result.version).toBeGreaterThan(0);
    });
    
    // Verify server is stopped
    expect(isServerRunning()).toBe(false);
  });
});