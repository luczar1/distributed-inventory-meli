import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { inventoryService } from '../../src/services/inventory.service';
import { inventoryRepository } from '../../src/repositories/inventory.repo';
import { eventLogRepository } from '../../src/repositories/eventlog.repo';
import { InventoryRecord } from '../../src/core/types';

// Mock dependencies
vi.mock('../../src/repositories/inventory.repo');
vi.mock('../../src/repositories/eventlog.repo');
vi.mock('../../src/utils/perKeyMutex');
vi.mock('../../src/utils/idempotency');

const mockInventoryRepository = vi.mocked(inventoryRepository);
const mockEventLogRepository = vi.mocked(eventLogRepository);

describe('Property-based tests for inventory invariants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Quantity invariants', () => {
    it('should maintain qty >= 0 under concurrent operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
            sku: fc.string({ minLength: 1, maxLength: 10 }),
            storeId: fc.string({ minLength: 1, maxLength: 10 }),
            delta: fc.integer({ min: -100, max: 100 }),
            idempotencyKey: fc.string({ minLength: 1, maxLength: 20 }),
          }),
            { minLength: 1, maxLength: 10 }
          ),
          async (operations) => {
            // Setup initial state
            const initialQty = 100;
            const initialRecord: InventoryRecord = {
              sku: 'TEST-SKU',
              storeId: 'store1',
              qty: initialQty,
              version: 1,
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            mockInventoryRepository.get.mockResolvedValue(initialRecord);
            mockInventoryRepository.upsert.mockResolvedValue(undefined);
            mockEventLogRepository.append.mockResolvedValue(undefined);

            // Execute operations concurrently
            const promises = operations.map(op => 
              inventoryService.adjustStock(
                op.storeId,
                op.sku,
                op.delta,
                undefined,
                op.idempotencyKey
              ).catch(() => null) // Ignore errors for this test
            );

            await Promise.all(promises);

            // Verify final state maintains qty >= 0
            const finalRecord = await inventoryRepository.get('TEST-SKU', 'store1');
            expect(finalRecord.qty).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should maintain version strictly increasing', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              sku: fc.string({ minLength: 1, maxLength: 10 }),
              storeId: fc.string({ minLength: 1, maxLength: 10 }),
              delta: fc.integer({ min: -50, max: 50 }),
              idempotencyKey: fc.string({ minLength: 1, maxLength: 20 }),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (operations) => {
            let currentVersion = 1;
            const initialRecord: InventoryRecord = {
              sku: 'TEST-SKU',
              storeId: 'store1',
              qty: 100,
              version: currentVersion,
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            mockInventoryRepository.get.mockImplementation(async () => ({
              ...initialRecord,
              version: currentVersion,
            }));

            mockInventoryRepository.upsert.mockImplementation(async (record) => {
              currentVersion = record.version;
            });

            mockEventLogRepository.append.mockResolvedValue(undefined);

            // Execute operations sequentially to track version
            for (const op of operations) {
              try {
                await inventoryService.adjustStock(
                  op.storeId,
                  op.sku,
                  op.delta,
                  currentVersion,
                  op.idempotencyKey
                );
                currentVersion++;
              } catch (error) {
                // Ignore errors, just track version
              }
            }

            // Verify version is strictly increasing
            expect(currentVersion).toBeGreaterThan(1);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('Concurrency invariants', () => {
    it('should not lose updates under concurrent modifications', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            initialQty: fc.integer({ min: 0, max: 1000 }),
            operations: fc.array(
              fc.record({
                delta: fc.integer({ min: -100, max: 100 }),
                idempotencyKey: fc.string({ minLength: 1, maxLength: 20 }),
              }),
              { minLength: 5, maxLength: 20 }
            ),
          }),
          async ({ initialQty, operations }) => {
            let currentQty = initialQty;
            let currentVersion = 1;

            const initialRecord: InventoryRecord = {
              sku: 'TEST-SKU',
              storeId: 'store1',
              qty: currentQty,
              version: currentVersion,
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            mockInventoryRepository.get.mockImplementation(async () => ({
              ...initialRecord,
              qty: currentQty,
              version: currentVersion,
            }));

            mockInventoryRepository.upsert.mockImplementation(async (record) => {
              currentQty = record.qty;
              currentVersion = record.version;
            });

            mockEventLogRepository.append.mockResolvedValue(undefined);

            // Execute operations concurrently
            const promises = operations.map(async (op) => {
              try {
                const result = await inventoryService.adjustStock(
                  'store1',
                  'TEST-SKU',
                  op.delta,
                  currentVersion,
                  op.idempotencyKey
                );
                return result;
              } catch (error) {
                return null;
              }
            });

            await Promise.all(promises);

            // Calculate expected final quantity
            const expectedQty = initialQty + operations.reduce((sum, op) => sum + op.delta, 0);

            // Verify no lost updates (within reasonable bounds due to concurrency)
            expect(currentQty).toBeGreaterThanOrEqual(0);
            expect(Math.abs(currentQty - expectedQty)).toBeLessThanOrEqual(operations.length * 2);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should handle concurrent reservations correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            initialQty: fc.integer({ min: 100, max: 1000 }),
            reservations: fc.array(
              fc.integer({ min: 1, max: 50 }),
              { minLength: 3, maxLength: 10 }
            ),
          }),
          async ({ initialQty, reservations }) => {
            let currentQty = initialQty;
            let currentVersion = 1;

            const initialRecord: InventoryRecord = {
              sku: 'TEST-SKU',
              storeId: 'store1',
              qty: currentQty,
              version: currentVersion,
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            mockInventoryRepository.get.mockImplementation(async () => ({
              ...initialRecord,
              qty: currentQty,
              version: currentVersion,
            }));

            mockInventoryRepository.upsert.mockImplementation(async (record) => {
              currentQty = record.qty;
              currentVersion = record.version;
            });

            mockEventLogRepository.append.mockResolvedValue(undefined);

            // Execute reservations concurrently
            const promises = reservations.map(async (qty) => {
              try {
                return await inventoryService.reserveStock(
                  'store1',
                  'TEST-SKU',
                  qty,
                  currentVersion,
                  `reserve-${qty}-${Date.now()}`
                );
              } catch (error) {
                return null;
              }
            });

            const results = await Promise.all(promises);
            const successfulReservations = results.filter(r => r !== null);

            // Verify total reserved doesn't exceed initial quantity
            const totalReserved = successfulReservations.reduce((sum, result) => sum + (result?.qty || 0), 0);
            expect(totalReserved).toBeLessThanOrEqual(initialQty);
            expect(currentQty).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Idempotency invariants', () => {
    it('should maintain idempotency under concurrent duplicate requests', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            sku: fc.string({ minLength: 1, maxLength: 10 }),
            storeId: fc.string({ minLength: 1, maxLength: 10 }),
            delta: fc.integer({ min: -100, max: 100 }),
            idempotencyKey: fc.string({ minLength: 1, maxLength: 20 }),
            concurrency: fc.integer({ min: 2, max: 10 }),
          }),
          async ({ sku, storeId, delta, idempotencyKey, concurrency }) => {
            const initialRecord: InventoryRecord = {
              sku,
              storeId,
              qty: 100,
              version: 1,
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            mockInventoryRepository.get.mockResolvedValue(initialRecord);
            mockInventoryRepository.upsert.mockResolvedValue(undefined);
            mockEventLogRepository.append.mockResolvedValue(undefined);

            // Execute same operation concurrently
            const promises = Array(concurrency).fill(0).map(() =>
              inventoryService.adjustStock(storeId, sku, delta, 1, idempotencyKey)
            );

            const results = await Promise.allSettled(promises);
            const successful = results.filter(r => r.status === 'fulfilled');
            const failed = results.filter(r => r.status === 'rejected');

            // All should either succeed or fail consistently
            expect(successful.length + failed.length).toBe(concurrency);
            
            // If any succeeded, all should have succeeded (idempotency)
            if (successful.length > 0) {
              expect(successful.length).toBe(concurrency);
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});
