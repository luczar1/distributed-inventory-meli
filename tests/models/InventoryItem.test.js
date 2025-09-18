/**
 * InventoryItem Model Tests
 */
const InventoryItem = require('../../src/models/InventoryItem');

describe('InventoryItem', () => {
  let item;

  beforeEach(() => {
    item = new InventoryItem('TEST-SKU', 'Test Item', 100, 10);
  });

  describe('Constructor', () => {
    test('should create item with correct properties', () => {
      expect(item.sku).toBe('TEST-SKU');
      expect(item.name).toBe('Test Item');
      expect(item.quantity).toBe(100);
      expect(item.reserved).toBe(10);
      expect(item.version).toBe(1);
      expect(item.available).toBe(90);
    });

    test('should handle default values', () => {
      const defaultItem = new InventoryItem('SKU', 'Name');
      expect(defaultItem.quantity).toBe(0);
      expect(defaultItem.reserved).toBe(0);
      expect(defaultItem.version).toBe(1);
    });
  });

  describe('Available Quantity', () => {
    test('should calculate available quantity correctly', () => {
      expect(item.available).toBe(90);
    });

    test('should not return negative available quantity', () => {
      item.reserved = 150;
      expect(item.available).toBe(0);
    });
  });

  describe('Reserve', () => {
    test('should reserve quantity successfully', () => {
      const result = item.reserve(20);
      expect(result).toBe(true);
      expect(item.reserved).toBe(30);
      expect(item.available).toBe(70);
    });

    test('should not reserve more than available', () => {
      const result = item.reserve(100);
      expect(result).toBe(false);
      expect(item.reserved).toBe(10);
    });

    test('should not reserve negative quantity', () => {
      const result = item.reserve(-5);
      expect(result).toBe(false);
      expect(item.reserved).toBe(10);
    });
  });

  describe('Release', () => {
    test('should release quantity successfully', () => {
      const result = item.release(5);
      expect(result).toBe(true);
      expect(item.reserved).toBe(5);
      expect(item.available).toBe(95);
    });

    test('should not release more than reserved', () => {
      const result = item.release(20);
      expect(result).toBe(false);
      expect(item.reserved).toBe(10);
    });

    test('should not release negative quantity', () => {
      const result = item.release(-5);
      expect(result).toBe(false);
      expect(item.reserved).toBe(10);
    });
  });

  describe('Add', () => {
    test('should add quantity successfully', () => {
      item.add(50);
      expect(item.quantity).toBe(150);
      expect(item.version).toBe(2);
    });

    test('should not add negative quantity', () => {
      item.add(-10);
      expect(item.quantity).toBe(100);
      expect(item.version).toBe(1);
    });
  });

  describe('Remove', () => {
    test('should remove quantity successfully', () => {
      const result = item.remove(30);
      expect(result).toBe(true);
      expect(item.quantity).toBe(70);
      expect(item.version).toBe(2);
    });

    test('should not remove more than available', () => {
      const result = item.remove(100);
      expect(result).toBe(false);
      expect(item.quantity).toBe(100);
    });

    test('should not remove negative quantity', () => {
      const result = item.remove(-10);
      expect(result).toBe(false);
      expect(item.quantity).toBe(100);
    });
  });

  describe('JSON Serialization', () => {
    test('should serialize to JSON correctly', () => {
      const json = item.toJSON();
      expect(json).toEqual({
        sku: 'TEST-SKU',
        name: 'Test Item',
        quantity: 100,
        reserved: 10,
        available: 90,
        version: 1,
        lastUpdated: expect.any(String),
        createdAt: expect.any(String)
      });
    });

    test('should deserialize from JSON correctly', () => {
      const json = item.toJSON();
      const newItem = InventoryItem.fromJSON(json);
      expect(newItem.sku).toBe(item.sku);
      expect(newItem.name).toBe(item.name);
      expect(newItem.quantity).toBe(item.quantity);
      expect(newItem.reserved).toBe(item.reserved);
      expect(newItem.version).toBe(item.version);
    });
  });

  describe('Validation', () => {
    test('should validate correct data', () => {
      const data = {
        sku: 'TEST-SKU',
        name: 'Test Item',
        quantity: 100,
        reserved: 10
      };
      const result = InventoryItem.validate(data);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject invalid data', () => {
      const data = {
        sku: '',
        name: '',
        quantity: -10,
        reserved: 20
      };
      const result = InventoryItem.validate(data);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should reject reserved > quantity', () => {
      const data = {
        sku: 'TEST-SKU',
        name: 'Test Item',
        quantity: 10,
        reserved: 20
      };
      const result = InventoryItem.validate(data);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Reserved quantity cannot exceed total quantity');
    });
  });
});
