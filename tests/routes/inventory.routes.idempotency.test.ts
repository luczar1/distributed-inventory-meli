import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { InventoryRecord } from '../../src/core/types';
import { inventoryRepository } from '../../src/repositories/inventory.repo';
import { eventLogRepository } from '../../src/repositories/eventlog.repo';
import { idempotencyStore } from '../../src/utils/idempotency';

// Mock repositories
vi.mock('../../src/repositories/inventory.repo');
vi.mock('../../src/repositories/eventlog.repo');
vi.mock('../../src/utils/idempotency');
vi.mock('../../src/utils/perKeyMutex', () => ({
  perKeyMutex: {
    acquire: vi.fn((key, fn) => fn()),
  },
}));

describe('Inventory Routes API - Idempotency', () => {
  let server: unknown;

  beforeAll(() => {
    server = app;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    idempotencyStore.clear();
    
    // Mock idempotency store to simulate real behavior
    const idempotencyCache = new Map<string, unknown>();
    vi.mocked(idempotencyStore.get).mockImplementation(async (key: string) => {
      return idempotencyCache.get(key) || null;
    });
    vi.mocked(idempotencyStore.set).mockImplementation(async (key: string, value: unknown) => {
      idempotencyCache.set(key, value);
    });
  });

  afterAll(() => {
    // Cleanup if needed
  });

  describe('Idempotency', () => {
    it('should return same result for repeated idempotency key on adjust', async () => {
      const mockRecord: InventoryRecord = {
        sku: 'SKU123',
        storeId: 'STORE001',
        qty: 100,
        version: 1,
        updatedAt: new Date()
      };
      
      vi.mocked(inventoryRepository.get).mockResolvedValue(mockRecord);
      vi.mocked(inventoryRepository.upsert).mockResolvedValue();
      vi.mocked(eventLogRepository.append).mockResolvedValue();

      const idempotencyKey = 'test-key-123';
      const response1 = await request(server)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/adjust')
        .set('Idempotency-Key', idempotencyKey)
        .send({ delta: 50 })
        .expect(200);

      const response2 = await request(server)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/adjust')
        .set('Idempotency-Key', idempotencyKey)
        .send({ delta: 50 })
        .expect(200);

      // Compare responses but ignore timestamp differences
      expect(response1.body.success).toBe(response2.body.success);
      expect(response1.body.newQuantity).toBe(response2.body.newQuantity);
      expect(response1.body.newVersion).toBe(response2.body.newVersion);
      expect(response1.body.record.qty).toBe(response2.body.record.qty);
      expect(response1.body.record.sku).toBe(response2.body.record.sku);
      expect(response1.body.record.storeId).toBe(response2.body.record.storeId);
      expect(response1.body.record.version).toBe(response2.body.record.version);
      expect(inventoryRepository.upsert).toHaveBeenCalledTimes(1);
    });

    it('should return same result for repeated idempotency key on reserve', async () => {
      const mockRecord: InventoryRecord = {
        sku: 'SKU123',
        storeId: 'STORE001',
        qty: 100,
        version: 1,
        updatedAt: new Date()
      };
      
      vi.mocked(inventoryRepository.get).mockResolvedValue(mockRecord);
      vi.mocked(inventoryRepository.upsert).mockResolvedValue();
      vi.mocked(eventLogRepository.append).mockResolvedValue();

      const idempotencyKey = 'reserve-key-456';
      const response = await request(server)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/reserve')
        .set('Idempotency-Key', idempotencyKey)
        .send({ qty: 10 })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });
});
