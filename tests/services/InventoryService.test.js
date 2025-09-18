/**
 * InventoryService Tests
 */
const InventoryService = require('../../src/services/InventoryService');
const InventoryItem = require('../../src/models/InventoryItem');

describe('InventoryService', () => {
  let service;

  beforeEach(() => {
    service = new InventoryService('test-store');
  });

  afterEach(async () => {
    // Clean up test data
    try {
      const items = await service.loadInventory();
      for (const sku of Object.keys(items)) {
        await service.removeItem(sku, items[sku].quantity);
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Add Item', () => {
    test('should add new item successfully', async () => {
      const result = await service.addItem('TEST-SKU', 'Test Item', 100);
      
      expect(result.success).toBe(true);
      expect(result.item.sku).toBe('TEST-SKU');
      expect(result.item.name).toBe('Test Item');
      expect(result.item.quantity).toBe(100);
      expect(result.operation.status).toBe('completed');
    });

    test('should add to existing item', async () => {
      await service.addItem('TEST-SKU', 'Test Item', 50);
      const result = await service.addItem('TEST-SKU', 'Test Item', 30);
      
      expect(result.success).toBe(true);
      expect(result.item.quantity).toBe(80);
    });

    test('should handle idempotency key', async () => {
      const idempotencyKey = 'test-key-123';
      
      const result1 = await service.addItem('TEST-SKU', 'Test Item', 100, idempotencyKey);
      const result2 = await service.addItem('TEST-SKU', 'Test Item', 100, idempotencyKey);
      
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result2.message).toBe('Operation already completed');
    });
  });

  describe('Remove Item', () => {
    test('should remove item successfully', async () => {
      await service.addItem('TEST-SKU', 'Test Item', 100);
      const result = await service.removeItem('TEST-SKU', 30);
      
      expect(result.success).toBe(true);
      expect(result.item.quantity).toBe(70);
    });

    test('should fail to remove non-existent item', async () => {
      await expect(service.removeItem('NON-EXISTENT', 10))
        .rejects.toThrow('Item NON-EXISTENT not found');
    });

    test('should fail to remove more than available', async () => {
      await service.addItem('TEST-SKU', 'Test Item', 50);
      await expect(service.removeItem('TEST-SKU', 100))
        .rejects.toThrow('Insufficient quantity');
    });
  });

  describe('Reserve Item', () => {
    test('should reserve item successfully', async () => {
      await service.addItem('TEST-SKU', 'Test Item', 100);
      const result = await service.reserveItem('TEST-SKU', 20);
      
      expect(result.success).toBe(true);
      expect(result.item.reserved).toBe(20);
      expect(result.item.available).toBe(80);
    });

    test('should fail to reserve non-existent item', async () => {
      await expect(service.reserveItem('NON-EXISTENT', 10))
        .rejects.toThrow('Item NON-EXISTENT not found');
    });

    test('should fail to reserve more than available', async () => {
      await service.addItem('TEST-SKU', 'Test Item', 50);
      await expect(service.reserveItem('TEST-SKU', 100))
        .rejects.toThrow('Insufficient available quantity');
    });
  });

  describe('Release Item', () => {
    test('should release item successfully', async () => {
      await service.addItem('TEST-SKU', 'Test Item', 100);
      await service.reserveItem('TEST-SKU', 30);
      const result = await service.releaseItem('TEST-SKU', 10);
      
      expect(result.success).toBe(true);
      expect(result.item.reserved).toBe(20);
      expect(result.item.available).toBe(80);
    });

    test('should fail to release non-existent item', async () => {
      await expect(service.releaseItem('NON-EXISTENT', 10))
        .rejects.toThrow('Item NON-EXISTENT not found');
    });

    test('should fail to release more than reserved', async () => {
      await service.addItem('TEST-SKU', 'Test Item', 100);
      await service.reserveItem('TEST-SKU', 20);
      await expect(service.releaseItem('TEST-SKU', 30))
        .rejects.toThrow('Insufficient reserved quantity');
    });
  });

  describe('Get Item', () => {
    test('should get item successfully', async () => {
      await service.addItem('TEST-SKU', 'Test Item', 100);
      const item = await service.getItem('TEST-SKU');
      
      expect(item.sku).toBe('TEST-SKU');
      expect(item.name).toBe('Test Item');
      expect(item.quantity).toBe(100);
    });

    test('should fail to get non-existent item', async () => {
      await expect(service.getItem('NON-EXISTENT'))
        .rejects.toThrow('Item NON-EXISTENT not found');
    });
  });

  describe('Get All Items', () => {
    test('should get all items', async () => {
      await service.addItem('SKU1', 'Item 1', 100);
      await service.addItem('SKU2', 'Item 2', 200);
      
      const items = await service.getAllItems();
      
      expect(Object.keys(items)).toHaveLength(2);
      expect(items.SKU1.sku).toBe('SKU1');
      expect(items.SKU2.sku).toBe('SKU2');
    });

    test('should return empty object when no items', async () => {
      const items = await service.getAllItems();
      expect(items).toEqual({});
    });
  });

  describe('Concurrency', () => {
    test('should handle concurrent operations', async () => {
      await service.addItem('TEST-SKU', 'Test Item', 100);
      
      // Simulate concurrent operations
      const promises = [
        service.reserveItem('TEST-SKU', 20),
        service.reserveItem('TEST-SKU', 30),
        service.reserveItem('TEST-SKU', 10)
      ];
      
      const results = await Promise.all(promises);
      
      expect(results.every(r => r.success)).toBe(true);
      
      const item = await service.getItem('TEST-SKU');
      expect(item.reserved).toBe(60);
      expect(item.available).toBe(40);
    });
  });

  describe('Persistence', () => {
    test('should persist data between service instances', async () => {
      await service.addItem('TEST-SKU', 'Test Item', 100);
      
      // Create new service instance
      const newService = new InventoryService('test-store');
      const item = await newService.getItem('TEST-SKU');
      
      expect(item.sku).toBe('TEST-SKU');
      expect(item.quantity).toBe(100);
    });
  });
});
