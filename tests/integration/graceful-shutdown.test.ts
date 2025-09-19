import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { readFile, writeFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';

describe('Graceful shutdown integration test', () => {
  let serverProcess: ChildProcess | null = null;
  const testDataDir = join(__dirname, '../../data');
  const testFiles = [
    'store-inventory.json',
    'central-inventory.json',
    'event-log.json',
  ];

  beforeEach(async () => {
    // Clean up test data
    for (const file of testFiles) {
      const filePath = join(testDataDir, file);
      if (existsSync(filePath)) {
        await unlink(filePath);
      }
    }

    // Create test data directory
    if (!existsSync(testDataDir)) {
      await writeFile(join(testDataDir, 'store-inventory.json'), '[]');
      await writeFile(join(testDataDir, 'central-inventory.json'), '{}');
      await writeFile(join(testDataDir, 'event-log.json'), '[]');
    }
  });

  afterEach(async () => {
    // Kill server process if still running
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill('SIGKILL');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    serverProcess = null;
  });

  it('should handle graceful shutdown with SIGTERM', async () => {
    // Start server process
    serverProcess = spawn('npm', ['run', 'dev'], {
      cwd: join(__dirname, '../..'),
      stdio: 'pipe',
      env: { ...process.env, PORT: '3001' },
    });

    let serverOutput = '';
    let serverError = '';

    serverProcess.stdout?.on('data', (data) => {
      serverOutput += data.toString();
    });

    serverProcess.stderr?.on('data', (data) => {
      serverError += data.toString();
    });

    // Wait for server to start by checking for startup message
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server startup timeout'));
      }, 10000); // 10 second timeout
      
      const checkStartup = () => {
        if (serverOutput.includes('Server running on port')) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkStartup, 100);
        }
      };
      checkStartup();
    });

    // Make some requests to create in-flight operations
    const requests = Array(5).fill(0).map(async (_, i) => {
      try {
        const response = await fetch('http://localhost:3001/api/inventory/stores/store1/inventory/SKU123/adjust', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': `test-${i}`,
          },
          body: JSON.stringify({ delta: 10 }),
        });
        return { status: response.status, success: true };
      } catch (error) {
        return { status: 0, success: false, error: (error as Error).message };
      }
    });

    // Start requests
    const requestPromises = requests;

    // Wait a bit for requests to start
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Send SIGTERM
    serverProcess.kill('SIGTERM');

    // Wait for graceful shutdown
    await new Promise(resolve => {
      serverProcess!.on('exit', (code) => {
        expect(code).toBe(0);
        resolve(undefined);
      });
    });

    // Wait for requests to complete
    const results = await Promise.allSettled(requestPromises);

    // Verify server output contains shutdown messages
    expect(serverOutput).toContain('SIGTERM received');
    expect(serverOutput).toContain('graceful shutdown');
    expect(serverOutput).toContain('Stopping sync worker');
    expect(serverOutput).toContain('Draining bulkheads');
    expect(serverOutput).toContain('Running final sync');
    expect(serverOutput).toContain('Graceful shutdown completed');

    // Verify no errors in stderr
    expect(serverError).toBe('');
  }, 30000);

  it('should handle graceful shutdown with SIGINT', async () => {
    // Start server process
    serverProcess = spawn('npm', ['run', 'dev'], {
      cwd: join(__dirname, '../..'),
      stdio: 'pipe',
      env: { ...process.env, PORT: '3002' },
    });

    let serverOutput = '';

    serverProcess.stdout?.on('data', (data) => {
      serverOutput += data.toString();
    });

    // Wait for server to start by checking for startup message
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server startup timeout'));
      }, 10000); // 10 second timeout
      
      const checkStartup = () => {
        if (serverOutput.includes('Server running on port')) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkStartup, 100);
        }
      };
      checkStartup();
    });

    // Send SIGINT
    serverProcess.kill('SIGINT');

    // Wait for graceful shutdown
    await new Promise(resolve => {
      serverProcess!.on('exit', (code) => {
        expect(code).toBe(0);
        resolve(undefined);
      });
    });

    // Verify server output contains shutdown messages
    expect(serverOutput).toContain('SIGINT received');
    expect(serverOutput).toContain('graceful shutdown');
  }, 30000);

  it('should ensure final state is persisted after shutdown', async () => {
    // Start server process
    serverProcess = spawn('npm', ['run', 'dev'], {
      cwd: join(__dirname, '../..'),
      stdio: 'pipe',
      env: { ...process.env, PORT: '3003' },
    });

    // Wait for server to start by checking for startup message
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server startup timeout'));
      }, 10000); // 10 second timeout
      
      const checkStartup = () => {
        if (serverOutput.includes('Server running on port')) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkStartup, 100);
        }
      };
      checkStartup();
    });

    // Make some requests to create state changes
    try {
      await fetch('http://localhost:3003/api/inventory/stores/store1/inventory/SKU123/adjust', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'persistence-test',
        },
        body: JSON.stringify({ delta: 50 }),
      });
    } catch (error) {
      // Ignore errors, we just want to trigger some state changes
    }

    // Wait for state to be written
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Send SIGTERM
    serverProcess.kill('SIGTERM');

    // Wait for graceful shutdown
    await new Promise(resolve => {
      serverProcess!.on('exit', (code) => {
        expect(code).toBe(0);
        resolve(undefined);
      });
    });

    // Verify final sync was run
    const eventLogPath = join(testDataDir, 'event-log.json');
    const centralInventoryPath = join(testDataDir, 'central-inventory.json');

    // Check that files exist and have content
    expect(existsSync(eventLogPath)).toBe(true);
    expect(existsSync(centralInventoryPath)).toBe(true);

    // Verify event log has events
    const eventLogContent = await readFile(eventLogPath, 'utf-8');
    const eventLog = JSON.parse(eventLogContent);
    expect(Array.isArray(eventLog.events)).toBe(true);

    // Verify central inventory has data
    const centralInventoryContent = await readFile(centralInventoryPath, 'utf-8');
    const centralInventory = JSON.parse(centralInventoryContent);
    expect(typeof centralInventory).toBe('object');
  }, 30000);

  it('should handle shutdown timeout gracefully', async () => {
    // Start server process
    serverProcess = spawn('npm', ['run', 'dev'], {
      cwd: join(__dirname, '../..'),
      stdio: 'pipe',
      env: { ...process.env, PORT: '3004' },
    });

    let serverOutput = '';

    serverProcess.stdout?.on('data', (data) => {
      serverOutput += data.toString();
    });

    // Wait for server to start by checking for startup message
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server startup timeout'));
      }, 10000); // 10 second timeout
      
      const checkStartup = () => {
        if (serverOutput.includes('Server running on port')) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkStartup, 100);
        }
      };
      checkStartup();
    });

    // Send SIGTERM
    serverProcess.kill('SIGTERM');

    // Wait for graceful shutdown (should complete within timeout)
    await new Promise(resolve => {
      serverProcess!.on('exit', (code) => {
        expect(code).toBe(0);
        resolve(undefined);
      });
    });

    // Verify shutdown completed
    expect(serverOutput).toContain('Graceful shutdown completed');
  }, 30000);
});
