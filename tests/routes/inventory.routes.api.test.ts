import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';

describe('Inventory Routes API', () => {
  let server: unknown;

  beforeAll(() => {
    server = app;
  });

  afterAll(() => {
    // Cleanup if needed
  });

  describe('GET /api/inventory/stores/:storeId/inventory/:sku', () => {
    it('should return inventory record with ETag header', async () => {
      const response = await request(server)
        .get('/api/inventory/stores/STORE001/inventory/SKU123')
        .expect(200);

      expect(response.body).toEqual({
        sku: 'SKU123',
        storeId: 'STORE001',
        qty: 100,
        version: 1,
        updatedAt: expect.any(String),
      });

      expect(response.headers.etag).toBe('"1"');
    });

    it('should validate store ID format', async () => {
      const response = await request(server)
        .get('/api/inventory/stores//inventory/SKU123')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should validate SKU format', async () => {
      const response = await request(server)
        .get('/api/inventory/stores/STORE001/inventory/')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/inventory/stores/:storeId/inventory/:sku/adjust', () => {
    it('should adjust stock with valid payload', async () => {
      const response = await request(server)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/adjust')
        .send({ delta: 50 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.newQuantity).toBe(150);
      expect(response.body.newVersion).toBe(2);
    });

    it('should adjust stock with expected version', async () => {
      const response = await request(server)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/adjust')
        .send({ delta: 25, expectedVersion: 1 })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should validate delta is integer', async () => {
      const response = await request(server)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/adjust')
        .send({ delta: 'invalid' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should validate expected version is positive integer', async () => {
      const response = await request(server)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/adjust')
        .send({ delta: 10, expectedVersion: -1 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should support idempotency key header', async () => {
      const idempotencyKey = 'test-key-123';
      const response = await request(server)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/adjust')
        .set('Idempotency-Key', idempotencyKey)
        .send({ delta: 30 })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/inventory/stores/:storeId/inventory/:sku/reserve', () => {
    it('should reserve stock with valid payload', async () => {
      const response = await request(server)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/reserve')
        .send({ qty: 20 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.newQuantity).toBe(80);
      expect(response.body.newVersion).toBe(2);
    });

    it('should reserve stock with expected version', async () => {
      const response = await request(server)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/reserve')
        .send({ qty: 15, expectedVersion: 1 })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should validate qty is non-negative integer', async () => {
      const response = await request(server)
        .post('/api/inventory/stores/STORE001/inventory/SKU123/reserve')
        .send({ qty: -5 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should support idempotency key header', async () => {
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
