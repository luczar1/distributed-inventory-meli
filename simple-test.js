const request = require('supertest');
const { app } = require('./src/app');

async function testBasicRoute() {
  try {
    console.log('Testing basic route...');
    const response = await request(app)
      .post('/api/inventory/stores/store1/inventory/SKU123/adjust')
      .send({ delta: 20 });
    
    console.log('Status:', response.status);
    console.log('Body:', JSON.stringify(response.body, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

testBasicRoute();
