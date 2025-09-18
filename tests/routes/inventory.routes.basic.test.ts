import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { inventoryRoutes } from '../../src/routes/inventory.routes';
import { requestIdMiddleware } from '../../src/middleware/request-id';
import { errorHandler } from '../../src/middleware/error-handler';

describe('Inventory Routes - Basic', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use('/api/inventory', inventoryRoutes);
    app.use(errorHandler);
  });

  describe('GET /:sku/:storeId', () => {
    it('should return inventory item', async () => {
      // First create the inventory record
      await request(app)
        .post('/api/inventory')
        .send({
          sku: 'SKU123',
          storeId: 'STORE001',
          initialQuantity: 100
        })
        .expect(201);

      const response = await request(app)
        .get('/api/inventory/SKU123/STORE001')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          sku: 'SKU123',
          storeId: 'STORE001',
          qty: 100,
          version: 1,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        },
      });
    });

    it('should return valid date in updatedAt', async () => {
      // First create the inventory record
      await request(app)
        .post('/api/inventory')
        .send({
          sku: 'SKU123',
          storeId: 'STORE001',
          initialQuantity: 100
        })
        .expect(201);

      const response = await request(app)
        .get('/api/inventory/SKU123/STORE001')
        .expect(200);

      const updatedAt = new Date(response.body.data.updatedAt);
      expect(updatedAt).toBeInstanceOf(Date);
      expect(updatedAt.getTime()).not.toBeNaN();
    });

    it('should handle different SKU and store combinations', async () => {
      const testCases = [
        { sku: 'ABC123', storeId: 'STORE001' },
        { sku: 'XYZ789', storeId: 'STORE002' },
        { sku: 'PRODUCT-001', storeId: 'NYC-001' },
      ];

      for (const testCase of testCases) {
        // First create the inventory record
        await request(app)
          .post('/api/inventory')
          .send({
            sku: testCase.sku,
            storeId: testCase.storeId,
            initialQuantity: 100
          })
          .expect(201);

        const response = await request(app)
          .get(`/api/inventory/${testCase.sku}/${testCase.storeId}`)
          .expect(200);

        expect(response.body.data.sku).toBe(testCase.sku);
        expect(response.body.data.storeId).toBe(testCase.storeId);
        expect(response.body.data.qty).toBe(100);
        expect(response.body.data.version).toBe(1);
      }
    });

    it('should include request ID in response headers', async () => {
      // First create the inventory record
      await request(app)
        .post('/api/inventory')
        .send({
          sku: 'SKU123',
          storeId: 'STORE001',
          initialQuantity: 100
        })
        .expect(201);

      const response = await request(app)
        .get('/api/inventory/SKU123/STORE001')
        .expect(200);

      expect(response.headers['x-request-id']).toBeDefined();
    });
  });

  describe('POST /', () => {
    it('should create inventory item with valid data', async () => {
      const requestData = {
        sku: 'SKU456',
        storeId: 'STORE002',
        initialQuantity: 50,
      };

      const response = await request(app)
        .post('/api/inventory')
        .send(requestData)
        .expect(201);

      expect(response.body).toEqual({
        success: true,
        data: {
          sku: 'SKU456',
          storeId: 'STORE002',
          qty: 50,
          version: 1,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        },
      });
    });

    it('should handle different initial quantities', async () => {
      const testCases = [0, 1, 100, 1000];

      for (const quantity of testCases) {
        const requestData = {
          sku: `SKU${quantity}`,
          storeId: 'STORE001',
          initialQuantity: quantity,
        };

        const response = await request(app)
          .post('/api/inventory')
          .send(requestData)
          .expect(201);

        expect(response.body.data.qty).toBe(quantity);
      }
    });

    it('should include request ID in response headers', async () => {
      const requestData = {
        sku: 'SKU456',
        storeId: 'STORE002',
        initialQuantity: 50,
      };

      const response = await request(app)
        .post('/api/inventory')
        .send(requestData)
        .expect(201);

      expect(response.headers['x-request-id']).toBeDefined();
    });
  });

  describe('Response format', () => {
    it('should return JSON response for GET', async () => {
      // First create the inventory record
      await request(app)
        .post('/api/inventory')
        .send({
          sku: 'SKU123',
          storeId: 'STORE001',
          initialQuantity: 100
        })
        .expect(201);

      const response = await request(app)
        .get('/api/inventory/SKU123/STORE001')
        .expect(200);

      expect(response.headers['content-type']).toContain('application/json');
    });

    it('should return JSON response for POST', async () => {
      const requestData = {
        sku: 'SKU456',
        storeId: 'STORE002',
        initialQuantity: 50,
      };

      const response = await request(app)
        .post('/api/inventory')
        .send(requestData)
        .expect(201);

      expect(response.headers['content-type']).toContain('application/json');
    });
  });
});
