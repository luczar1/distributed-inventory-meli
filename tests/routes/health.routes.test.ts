import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { healthRoutes } from '../../src/routes/health.routes';
import { requestIdMiddleware } from '../../src/middleware/request-id';

describe('Health Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(requestIdMiddleware);
    app.use('/api/health', healthRoutes);
  });

  describe('GET /', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          status: 'healthy',
          timestamp: expect.any(String),
          uptime: expect.any(Number),
        },
      });
    });

    it('should return valid timestamp', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      const timestamp = new Date(response.body.data.timestamp);
      expect(timestamp).toBeInstanceOf(Date);
      expect(timestamp.getTime()).not.toBeNaN();
    });

    it('should return valid uptime', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.data.uptime).toBeGreaterThanOrEqual(0);
      expect(typeof response.body.data.uptime).toBe('number');
    });

    it('should return healthy status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.data.status).toBe('healthy');
    });

    it('should include request ID in response headers', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.headers['x-request-id']).toBeDefined();
    });

    it('should handle multiple requests', async () => {
      const promises = Array.from({ length: 5 }, () =>
        request(app).get('/api/health').expect(200)
      );

      const responses = await Promise.all(promises);

      responses.forEach(response => {
        expect(response.body.success).toBe(true);
        expect(response.body.data.status).toBe('healthy');
      });
    });

    it('should return consistent response structure', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data).toHaveProperty('timestamp');
      expect(response.body.data).toHaveProperty('uptime');
    });
  });

  describe('Error handling', () => {
    it('should handle requests without errors', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Response format', () => {
    it('should return JSON response', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.headers['content-type']).toContain('application/json');
    });

    it('should have correct response structure', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      const { success, data } = response.body;
      
      expect(typeof success).toBe('boolean');
      expect(success).toBe(true);
      expect(typeof data).toBe('object');
      expect(data).not.toBeNull();
    });
  });

  describe('Performance', () => {
    it('should respond quickly', async () => {
      const startTime = Date.now();
      
      await request(app)
        .get('/api/health')
        .expect(200);
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      // Should respond within 100ms
      expect(responseTime).toBeLessThan(100);
    });
  });
});
