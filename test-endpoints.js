#!/usr/bin/env node

const http = require('http');

const BASE_URL = 'http://localhost:3000';

// Helper function to make HTTP requests
function makeRequest(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const jsonBody = body ? JSON.parse(body) : {};
          resolve({ status: res.statusCode, headers: res.headers, body: jsonBody });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body: body });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

// Test functions
async function testHealthEndpoint() {
  console.log('\n🏥 Testing Health Endpoint...');
  try {
    const response = await makeRequest('GET', '/api/health');
    console.log(`Status: ${response.status}`);
    console.log(`Response:`, response.body);
    console.log(`Request ID: ${response.headers['x-request-id']}`);
    return response.status === 200 && response.body.status === 'ok';
  } catch (error) {
    console.error('Health test failed:', error.message);
    return false;
  }
}

async function testInventoryGet() {
  console.log('\n📦 Testing Inventory GET...');
  try {
    const response = await makeRequest('GET', '/api/inventory/stores/STORE001/inventory/SKU123');
    console.log(`Status: ${response.status}`);
    console.log(`Response:`, response.body);
    console.log(`ETag: ${response.headers.etag}`);
    return response.status === 200 && response.body.sku === 'SKU123';
  } catch (error) {
    console.error('Inventory GET test failed:', error.message);
    return false;
  }
}

async function testInventoryAdjust() {
  console.log('\n📈 Testing Inventory Adjust...');
  try {
    const response = await makeRequest('POST', '/api/inventory/stores/STORE001/inventory/SKU123/adjust', {
      delta: 10
    });
    console.log(`Status: ${response.status}`);
    console.log(`Response:`, response.body);
    return response.status === 200 && response.body.success === true;
  } catch (error) {
    console.error('Inventory Adjust test failed:', error.message);
    return false;
  }
}

async function testInventoryReserve() {
  console.log('\n🔒 Testing Inventory Reserve...');
  try {
    const response = await makeRequest('POST', '/api/inventory/stores/STORE001/inventory/SKU123/reserve', {
      qty: 5
    });
    console.log(`Status: ${response.status}`);
    console.log(`Response:`, response.body);
    return response.status === 200 && response.body.success === true;
  } catch (error) {
    console.error('Inventory Reserve test failed:', error.message);
    return false;
  }
}

async function testSyncEndpoint() {
  console.log('\n🔄 Testing Sync Endpoint...');
  try {
    const response = await makeRequest('POST', '/api/sync');
    console.log(`Status: ${response.status}`);
    console.log(`Response:`, response.body);
    return response.status === 200 && response.body.success === true;
  } catch (error) {
    console.error('Sync test failed:', error.message);
    return false;
  }
}

async function testSyncStatus() {
  console.log('\n📊 Testing Sync Status...');
  try {
    const response = await makeRequest('GET', '/api/sync/status');
    console.log(`Status: ${response.status}`);
    console.log(`Response:`, response.body);
    return response.status === 200 && response.body.success === true;
  } catch (error) {
    console.error('Sync Status test failed:', error.message);
    return false;
  }
}

async function testValidationErrors() {
  console.log('\n❌ Testing Validation Errors...');
  try {
    // Test invalid delta
    const response1 = await makeRequest('POST', '/api/inventory/stores/STORE001/inventory/SKU123/adjust', {
      delta: 'invalid'
    });
    console.log(`Invalid delta - Status: ${response1.status}, Success: ${response1.body.success === false}`);
    
    // Test negative qty
    const response2 = await makeRequest('POST', '/api/inventory/stores/STORE001/inventory/SKU123/reserve', {
      qty: -5
    });
    console.log(`Negative qty - Status: ${response2.status}, Success: ${response2.body.success === false}`);
    
    return response1.status === 400 && response2.status === 400;
  } catch (error) {
    console.error('Validation test failed:', error.message);
    return false;
  }
}

async function testIdempotency() {
  console.log('\n🔄 Testing Idempotency...');
  try {
    const idempotencyKey = 'test-key-' + Date.now();
    const headers = { 'Idempotency-Key': idempotencyKey };
    
    const response1 = await makeRequest('POST', '/api/inventory/stores/STORE001/inventory/SKU123/adjust', {
      delta: 15
    }, headers);
    
    const response2 = await makeRequest('POST', '/api/inventory/stores/STORE001/inventory/SKU123/adjust', {
      delta: 15
    }, headers);
    
    console.log(`First request - Status: ${response1.status}`);
    console.log(`Second request - Status: ${response2.status}`);
    console.log(`Idempotency Key: ${idempotencyKey}`);
    
    return response1.status === 200 && response2.status === 200;
  } catch (error) {
    console.error('Idempotency test failed:', error.message);
    return false;
  }
}

// Main test runner
async function runAllTests() {
  console.log('🚀 Starting Distributed Inventory System Endpoint Tests...\n');
  
  const tests = [
    { name: 'Health Endpoint', fn: testHealthEndpoint },
    { name: 'Inventory GET', fn: testInventoryGet },
    { name: 'Inventory Adjust', fn: testInventoryAdjust },
    { name: 'Inventory Reserve', fn: testInventoryReserve },
    { name: 'Sync Endpoint', fn: testSyncEndpoint },
    { name: 'Sync Status', fn: testSyncStatus },
    { name: 'Validation Errors', fn: testValidationErrors },
    { name: 'Idempotency', fn: testIdempotency }
  ];
  
  const results = [];
  
  for (const test of tests) {
    try {
      const passed = await test.fn();
      results.push({ name: test.name, passed });
      console.log(`${passed ? '✅' : '❌'} ${test.name}: ${passed ? 'PASSED' : 'FAILED'}`);
    } catch (error) {
      console.log(`❌ ${test.name}: ERROR - ${error.message}`);
      results.push({ name: test.name, passed: false });
    }
  }
  
  // Summary
  console.log('\n📊 Test Summary:');
  console.log('================');
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  results.forEach(result => {
    console.log(`${result.passed ? '✅' : '❌'} ${result.name}`);
  });
  
  console.log(`\n🎯 Results: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('🎉 All tests passed! The distributed inventory system is working correctly.');
  } else {
    console.log('⚠️  Some tests failed. Check the output above for details.');
  }
}

// Run tests
runAllTests().catch(console.error);
