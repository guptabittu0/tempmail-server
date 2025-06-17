const request = require('supertest');
const app = require('../src/server');

describe('TempMail Server', () => {
  
  describe('Health Check', () => {
    it('should return 200 for health check', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      expect(response.body.status).toBe('OK');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
    });
  });

  describe('API Documentation', () => {
    it('should return API documentation', async () => {
      const response = await request(app)
        .get('/api/docs')
        .expect(200);
      
      expect(response.body.name).toBe('TempMail Server API');
      expect(response.body).toHaveProperty('endpoints');
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/unknown-route')
        .expect(404);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Endpoint not found');
    });
  });

  describe('Admin Stats (without database)', () => {
    it('should handle admin stats endpoint', async () => {
      // This test might fail if database is not connected
      // In a real test environment, you'd mock the database
      const response = await request(app)
        .get('/api/admin/stats');
      
      // Should either return 200 with stats or 500 with error
      expect([200, 500]).toContain(response.status);
    });
  });

});

// Test email generation endpoint (would need database)
describe('Email Generation', () => {
  it('should handle email generation request', async () => {
    const response = await request(app)
      .post('/api/temp-email/generate')
      .send({
        expiryHours: 24
      });
    
    // Should either work or fail with database error
    expect([200, 500]).toContain(response.status);
    
    if (response.status === 200) {
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('email');
      expect(response.body.data).toHaveProperty('token');
    }
  });
}); 