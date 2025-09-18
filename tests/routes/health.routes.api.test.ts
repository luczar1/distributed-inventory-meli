import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';

describe('Health Routes API', () => {
  let server: unknown;

  beforeAll(() => {
    server = app;
  });

  afterAll(() => {
    // Cleanup if needed
  });

  describe('GET /api/health', () => {
    it('should return status ok', async () => {
      const response = await request(server)
        .get('/api/health')
        .expect(200);

      expect(response.body).toEqual({ status: 'ok' });
    });

    it('should include request ID in response headers', async () => {
      const response = await request(server)
        .get('/api/health')
        .expect(200);

      expect(response.headers['x-request-id']).toBeDefined();
      expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('should accept custom request ID header', async () => {
      const customId = 'custom-request-id-123';
      const response = await request(server)
        .get('/api/health')
        .set('x-request-id', customId)
        .expect(200);

      expect(response.headers['x-request-id']).toBe(customId);
    });
  });
});
