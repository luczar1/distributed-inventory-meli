import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';

describe('API Tests', () => {
  beforeAll(() => {
    // Setup test environment
  });

  afterAll(() => {
    // Cleanup
  });

  it('should return health status', async () => {
    const response = await request(app)
      .get('/api/health')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('healthy');
  });

  it('should get inventory item', async () => {
    const response = await request(app)
      .get('/api/inventory/SKU123/STORE001')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.sku).toBe('SKU123');
    expect(response.body.data.storeId).toBe('STORE001');
  });

  it('should create inventory item', async () => {
    const response = await request(app)
      .post('/api/inventory')
      .send({
        sku: 'SKU456',
        storeId: 'STORE002',
        initialQuantity: 50
      })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.sku).toBe('SKU456');
    expect(response.body.data.qty).toBe(50);
  });

  it('should return validation error for missing fields', async () => {
    const response = await request(app)
      .post('/api/inventory')
      .send({
        sku: 'SKU789'
      })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.statusCode).toBe(400);
  });
});
