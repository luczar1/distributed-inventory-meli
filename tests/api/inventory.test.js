/**
 * Inventory API Tests
 */
const request = require('supertest');
const app = require('../../src/app');

describe('Inventory API', () => {
  describe('POST /api/inventory/items', () => {
    test('should add new item', async () => {
      const response = await request(app)
        .post('/api/inventory/items')
        .send({
          sku: 'TEST-SKU',
          name: 'Test Item',
          quantity: 100
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.sku).toBe('TEST-SKU');
      expect(response.body.data.quantity).toBe(100);
    });

    test('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/inventory/items')
        .send({
          sku: 'TEST-SKU'
          // Missing name and quantity
        });

      expect(response.status).toBe(400);
      expect(response.body.error.name).toBe('ValidationError');
    });

    test('should handle idempotency key', async () => {
      const idempotencyKey = 'test-key-123';
      
      const response1 = await request(app)
        .post('/api/inventory/items')
        .send({
          sku: 'TEST-SKU',
          name: 'Test Item',
          quantity: 100,
          idempotencyKey
        });

      const response2 = await request(app)
        .post('/api/inventory/items')
        .send({
          sku: 'TEST-SKU',
          name: 'Test Item',
          quantity: 100,
          idempotencyKey
        });

      expect(response1.status).toBe(201);
      expect(response2.status).toBe(201);
      expect(response2.body.message).toBe('Operation already completed');
    });
  });

  describe('GET /api/inventory/items', () => {
    test('should get all items', async () => {
      // Add test items
      await request(app)
        .post('/api/inventory/items')
        .send({
          sku: 'SKU1',
          name: 'Item 1',
          quantity: 100
        });

      await request(app)
        .post('/api/inventory/items')
        .send({
          sku: 'SKU2',
          name: 'Item 2',
          quantity: 200
        });

      const response = await request(app)
        .get('/api/inventory/items');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(2);
      expect(response.body.data.SKU1).toBeDefined();
      expect(response.body.data.SKU2).toBeDefined();
    });
  });

  describe('GET /api/inventory/items/:sku', () => {
    test('should get specific item', async () => {
      await request(app)
        .post('/api/inventory/items')
        .send({
          sku: 'TEST-SKU',
          name: 'Test Item',
          quantity: 100
        });

      const response = await request(app)
        .get('/api/inventory/items/TEST-SKU');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.sku).toBe('TEST-SKU');
    });

    test('should return 404 for non-existent item', async () => {
      const response = await request(app)
        .get('/api/inventory/items/NON-EXISTENT');

      expect(response.status).toBe(404);
      expect(response.body.error.name).toBe('NotFoundError');
    });
  });

  describe('PUT /api/inventory/items/:sku/quantity', () => {
    test('should update quantity', async () => {
      await request(app)
        .post('/api/inventory/items')
        .send({
          sku: 'TEST-SKU',
          name: 'Test Item',
          quantity: 100
        });

      const response = await request(app)
        .put('/api/inventory/items/TEST-SKU/quantity')
        .send({
          quantity: 150
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.quantity).toBe(150);
    });

    test('should decrease quantity', async () => {
      await request(app)
        .post('/api/inventory/items')
        .send({
          sku: 'TEST-SKU',
          name: 'Test Item',
          quantity: 100
        });

      const response = await request(app)
        .put('/api/inventory/items/TEST-SKU/quantity')
        .send({
          quantity: 50
        });

      expect(response.status).toBe(200);
      expect(response.body.data.quantity).toBe(50);
    });
  });

  describe('POST /api/inventory/items/:sku/reserve', () => {
    test('should reserve item', async () => {
      await request(app)
        .post('/api/inventory/items')
        .send({
          sku: 'TEST-SKU',
          name: 'Test Item',
          quantity: 100
        });

      const response = await request(app)
        .post('/api/inventory/items/TEST-SKU/reserve')
        .send({
          quantity: 20
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.reserved).toBe(20);
      expect(response.body.data.available).toBe(80);
    });

    test('should fail to reserve more than available', async () => {
      await request(app)
        .post('/api/inventory/items')
        .send({
          sku: 'TEST-SKU',
          name: 'Test Item',
          quantity: 50
        });

      const response = await request(app)
        .post('/api/inventory/items/TEST-SKU/reserve')
        .send({
          quantity: 100
        });

      expect(response.status).toBe(422);
      expect(response.body.error.name).toBe('InsufficientQuantityError');
    });
  });

  describe('POST /api/inventory/items/:sku/release', () => {
    test('should release item', async () => {
      await request(app)
        .post('/api/inventory/items')
        .send({
          sku: 'TEST-SKU',
          name: 'Test Item',
          quantity: 100
        });

      await request(app)
        .post('/api/inventory/items/TEST-SKU/reserve')
        .send({
          quantity: 30
        });

      const response = await request(app)
        .post('/api/inventory/items/TEST-SKU/release')
        .send({
          quantity: 10
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.reserved).toBe(20);
      expect(response.body.data.available).toBe(80);
    });
  });

  describe('GET /api/inventory/operations/:idempotencyKey', () => {
    test('should get operation status', async () => {
      const idempotencyKey = 'test-key-123';
      
      await request(app)
        .post('/api/inventory/items')
        .send({
          sku: 'TEST-SKU',
          name: 'Test Item',
          quantity: 100,
          idempotencyKey
        });

      const response = await request(app)
        .get(`/api/inventory/operations/${idempotencyKey}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('completed');
    });
  });

  describe('GET /api/inventory/stats', () => {
    test('should get service statistics', async () => {
      const response = await request(app)
        .get('/api/inventory/stats');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.storeId).toBeDefined();
    });
  });
});
