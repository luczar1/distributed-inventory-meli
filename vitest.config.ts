import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    // Test isolation configuration
    isolate: true,
    pool: 'forks', // Use separate processes for better isolation
    poolOptions: {
      forks: {
        singleFork: false, // Allow multiple forks for parallel execution
      }
    },
    // Increase timeouts for integration tests
    testTimeout: 30000,
    hookTimeout: 30000,
    // Setup files for test isolation
    setupFiles: ['tests/helpers/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*'
      ]
    }
  }
});
