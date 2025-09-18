import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { inventoryRoutes } from '../../src/routes/inventory.routes';
import { requestIdMiddleware } from '../../src/middleware/request-id';
import { errorHandler } from '../../src/middleware/error-handler';

describe('Inventory Routes - Validation', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use('/api/inventory', inventoryRoutes);
    app.use(errorHandler);
  });

  describe('POST / validation errors', () => {
    it('should return 400 for missing sku', async () => {
      const requestData = {
        storeId: 'STORE002',
        initialQuantity: 50,
      };

      const response = await request(app)
        .post('/api/inventory')
        .send(requestData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('Missing required fields');
    });

    it('should return 400 for missing storeId', async () => {
      const requestData = {
        sku: 'SKU456',
        initialQuantity: 50,
      };

      const response = await request(app)
        .post('/api/inventory')
        .send(requestData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('Missing required fields');
    });

    it('should return 400 for missing initialQuantity', async () => {
      const requestData = {
        sku: 'SKU456',
        storeId: 'STORE002',
      };

      const response = await request(app)
        .post('/api/inventory')
        .send(requestData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('Missing required fields');
    });

    it('should return 400 for undefined initialQuantity', async () => {
      const requestData = {
        sku: 'SKU456',
        storeId: 'STORE002',
        initialQuantity: undefined,
      };

      const response = await request(app)
        .post('/api/inventory')
        .send(requestData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('Missing required fields');
    });

    it('should return 400 for empty sku', async () => {
      const requestData = {
        sku: '',
        storeId: 'STORE002',
        initialQuantity: 50,
      };

      const response = await request(app)
        .post('/api/inventory')
        .send(requestData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for empty storeId', async () => {
      const requestData = {
        sku: 'SKU456',
        storeId: '',
        initialQuantity: 50,
      };

      const response = await request(app)
        .post('/api/inventory')
        .send(requestData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Error handling', () => {
    it('should handle malformed JSON', async () => {
      await request(app)
        .post('/api/inventory')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(500); // JSON parse errors are handled as 500 by our error handler
    });

    it('should handle empty request body', async () => {
      const response = await request(app)
        .post('/api/inventory')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Concurrency', () => {
    it('should handle multiple concurrent requests', async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        request(app)
          .get(`/api/inventory/SKU${i}/STORE001`)
          .expect(200)
      );

      const responses = await Promise.all(promises);

      responses.forEach((response, index) => {
        expect(response.body.success).toBe(true);
        expect(response.body.data.sku).toBe(`SKU${index}`);
        expect(response.body.data.storeId).toBe('STORE001');
      });
    });

    it('should handle concurrent POST requests', async () => {
      const promises = Array.from({ length: 3 }, (_, i) =>
        request(app)
          .post('/api/inventory')
          .send({
            sku: `SKU${i}`,
            storeId: `STORE${i}`,
            initialQuantity: 10 + i,
          })
          .expect(201)
      );

      const responses = await Promise.all(promises);

      responses.forEach((response, index) => {
        expect(response.body.success).toBe(true);
        expect(response.body.data.sku).toBe(`SKU${index}`);
        expect(response.body.data.storeId).toBe(`STORE${index}`);
        expect(response.body.data.qty).toBe(10 + index);
      });
    });
  });
});
