import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';

describe('App', () => {
  describe('Health endpoint', () => {
    it('should respond to health check', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('healthy');
    });
  });

  describe('Inventory endpoints', () => {
    it('should respond to inventory GET', async () => {
      const response = await request(app)
        .get('/api/inventory/SKU123/STORE001')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.sku).toBe('SKU123');
      expect(response.body.data.storeId).toBe('STORE001');
    });

    it('should respond to inventory POST', async () => {
      const requestData = {
        sku: 'SKU456',
        storeId: 'STORE002',
        initialQuantity: 50,
      };

      const response = await request(app)
        .post('/api/inventory')
        .send(requestData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.sku).toBe('SKU456');
      expect(response.body.data.storeId).toBe('STORE002');
    });
  });

  describe('Request ID middleware', () => {
    it('should add request ID to responses', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.headers['x-request-id']).toBeDefined();
      expect(typeof response.headers['x-request-id']).toBe('string');
    });

    it('should use existing request ID from header', async () => {
      const customId = 'custom-request-id-123';
      const response = await request(app)
        .get('/api/health')
        .set('x-request-id', customId)
        .expect(200);

      expect(response.headers['x-request-id']).toBe(customId);
    });
  });

  describe('Error handling', () => {
    it('should handle 404 for unknown routes', async () => {
      await request(app)
        .get('/api/unknown')
        .expect(404); // Express returns 404 for unknown routes
    });

    it('should handle malformed JSON', async () => {
      await request(app)
        .post('/api/inventory')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400); // JSON parse errors are handled as 400 by our error handler
    });
  });

  describe('JSON parsing', () => {
    it('should parse JSON request bodies', async () => {
      const requestData = {
        sku: 'SKU789',
        storeId: 'STORE003',
        initialQuantity: 75,
      };

      const response = await request(app)
        .post('/api/inventory')
        .send(requestData)
        .expect(201);

      expect(response.body.data.sku).toBe('SKU789');
    });
  });

  describe('CORS and headers', () => {
    it('should include proper content type', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.headers['content-type']).toContain('application/json');
    });
  });
});
