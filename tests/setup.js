/**
 * Test Setup
 * Global test configuration and utilities
 */
const path = require('path');
const fs = require('fs');

// Create test data directory
const testDataDir = path.join(__dirname, '..', 'data', 'test');
if (!fs.existsSync(testDataDir)) {
  fs.mkdirSync(testDataDir, { recursive: true });
}

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.DATA_DIR = testDataDir;

// Global test timeout
jest.setTimeout(10000);

// Clean up before each test
beforeEach(() => {
  // Clean up test data files
  try {
    const files = fs.readdirSync(testDataDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        fs.unlinkSync(path.join(testDataDir, file));
      }
    }
  } catch (error) {
    // Ignore cleanup errors
  }
});

// Clean up after each test
afterEach(async () => {
  // Clean up test data files
  try {
    const files = fs.readdirSync(testDataDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        fs.unlinkSync(path.join(testDataDir, file));
      }
    }
  } catch (error) {
    // Ignore cleanup errors
  }
});

// Clean up after all tests
afterAll(() => {
  // Remove test data directory
  try {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
});
