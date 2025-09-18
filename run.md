# Running the Distributed Inventory System

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Server
```bash
npm run dev
```

The server will start on `http://localhost:3000` with the following features:
- ✅ Request logging with performance metrics
- ✅ Per-key async mutex for concurrency control
- ✅ Idempotency support for all operations
- ✅ Sync worker with 15-second interval
- ✅ Comprehensive metrics collection

### 3. Run Tests
```bash
npm test
```

## API Testing with curl

### Health Check
```bash
# Basic health check
curl http://localhost:3000/api/health

# Expected response:
# {"status":"ok"}
```

### Inventory Operations

#### Get Inventory Record
```bash
# Get inventory for SKU123 in STORE001
curl http://localhost:3000/api/inventory/stores/STORE001/inventory/SKU123

# Expected response:
# {
#   "sku": "SKU123",
#   "storeId": "STORE001", 
#   "qty": 100,
#   "version": 1,
#   "updatedAt": "2025-09-18T17:16:49.607Z"
# }
```

#### Adjust Stock (Increase)
```bash
# Increase stock by 50 units
curl -X POST http://localhost:3000/api/inventory/stores/STORE001/inventory/SKU123/adjust \
  -H "Content-Type: application/json" \
  -d '{"delta": 50}'

# Expected response:
# {
#   "success": true,
#   "newQuantity": 150,
#   "newVersion": 2,
#   "record": {
#     "sku": "SKU123",
#     "storeId": "STORE001",
#     "qty": 150,
#     "version": 2,
#     "updatedAt": "2025-09-18T17:16:49.617Z"
#   }
# }
```

#### Adjust Stock (Decrease)
```bash
# Decrease stock by 30 units
curl -X POST http://localhost:3000/api/inventory/stores/STORE001/inventory/SKU123/adjust \
  -H "Content-Type: application/json" \
  -d '{"delta": -30}'

# Expected response:
# {
#   "success": true,
#   "newQuantity": 120,
#   "newVersion": 3,
#   "record": {
#     "sku": "SKU123",
#     "storeId": "STORE001", 
#     "qty": 120,
#     "version": 3,
#     "updatedAt": "2025-09-18T17:16:49.627Z"
#   }
# }
```

#### Reserve Stock
```bash
# Reserve 25 units
curl -X POST http://localhost:3000/api/inventory/stores/STORE001/inventory/SKU123/reserve \
  -H "Content-Type: application/json" \
  -d '{"qty": 25}'

# Expected response:
# {
#   "success": true,
#   "newQuantity": 95,
#   "newVersion": 4,
#   "record": {
#     "sku": "SKU123",
#     "storeId": "STORE001",
#     "qty": 95,
#     "version": 4,
#     "updatedAt": "2025-09-18T17:16:49.637Z"
#   }
# }
```

### Idempotency Testing

#### Test Idempotent Operation
```bash
# First request with idempotency key
curl -X POST http://localhost:3000/api/inventory/stores/STORE001/inventory/SKU123/adjust \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-key-123" \
  -d '{"delta": 10}'

# Second request with same key (should return cached result)
curl -X POST http://localhost:3000/api/inventory/stores/STORE001/inventory/SKU123/adjust \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-key-123" \
  -d '{"delta": 10}'

# Both requests return identical results
```

### Version Conflict Testing

#### Test Version Mismatch
```bash
# Get current version first
curl http://localhost:3000/api/inventory/stores/STORE001/inventory/SKU123

# Try to adjust with stale version (should fail)
curl -X POST http://localhost:3000/api/inventory/stores/STORE001/inventory/SKU123/adjust \
  -H "Content-Type: application/json" \
  -d '{"delta": 10, "expectedVersion": 1}'

# Expected response (409 Conflict):
# {
#   "success": false,
#   "error": {
#     "name": "ConflictError",
#     "message": "Version mismatch for SKU SKU123 in store STORE001. Expected: 1, Actual: 4",
#     "code": "CONFLICT_ERROR",
#     "statusCode": 409,
#     "timestamp": "2025-09-18T17:16:49.647Z"
#   }
# }
```

### Sync Operations

#### Manual Sync
```bash
# Trigger manual sync
curl -X POST http://localhost:3000/api/sync

# Expected response:
# {
#   "success": true,
#   "message": "Sync completed successfully"
# }
```

#### Sync Status
```bash
# Get sync worker status
curl http://localhost:3000/api/sync/status

# Expected response:
# {
#   "success": true,
#   "data": {
#     "isRunning": true
#   }
# }
```

#### Start/Stop Sync Worker
```bash
# Start periodic sync with custom interval
curl -X POST http://localhost:3000/api/sync/start \
  -H "Content-Type: application/json" \
  -d '{"intervalMs": 10000}'

# Stop periodic sync
curl -X POST http://localhost:3000/api/sync/stop
```

### Metrics & Observability

#### Get System Metrics
```bash
# Get current metrics
curl http://localhost:3000/api/metrics

# Expected response:
# {
#   "success": true,
#   "data": {
#     "requests": 15,
#     "errors": 0,
#     "conflicts": 1,
#     "idempotentHits": 2,
#     "adjustStock": 3,
#     "reserveStock": 1,
#     "getInventory": 5,
#     "syncOperations": 1,
#     "timestamp": "2025-09-18T17:16:49.657Z",
#     "uptime": 45.123456789
#   }
# }
```

#### Reset Metrics (Testing)
```bash
# Reset all metrics
curl -X POST http://localhost:3000/api/metrics/reset

# Expected response:
# {
#   "success": true,
#   "message": "Metrics reset successfully"
# }
```

## Error Testing

### Validation Errors
```bash
# Invalid delta (string instead of number)
curl -X POST http://localhost:3000/api/inventory/stores/STORE001/inventory/SKU123/adjust \
  -H "Content-Type: application/json" \
  -d '{"delta": "invalid"}'

# Expected response (400 Bad Request):
# {
#   "success": false,
#   "error": {
#     "name": "ValidationError",
#     "message": "Validation failed: delta: Expected number, received string",
#     "code": "VALIDATION_ERROR",
#     "statusCode": 400,
#     "timestamp": "2025-09-18T17:16:49.667Z"
#   }
# }
```

### Insufficient Stock
```bash
# Try to reserve more than available
curl -X POST http://localhost:3000/api/inventory/stores/STORE001/inventory/SKU123/reserve \
  -H "Content-Type: application/json" \
  -d '{"qty": 1000}'

# Expected response (422 Unprocessable Entity):
# {
#   "success": false,
#   "error": {
#     "name": "InsufficientStockError",
#     "message": "Insufficient stock to reserve 1000 units of SKU123 in store STORE001. Available: 95",
#     "code": "INSUFFICIENT_STOCK_ERROR",
#     "statusCode": 422,
#     "timestamp": "2025-09-18T17:16:49.677Z"
#   }
# }
```

## Concurrency Testing

### Parallel Operations
```bash
# Run multiple operations in parallel to test concurrency
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/inventory/stores/STORE001/inventory/SKU123/adjust \
    -H "Content-Type: application/json" \
    -d "{\"delta\": 1}" &
done
wait

# Check final metrics
curl http://localhost:3000/api/metrics
```

### Request ID Tracking
```bash
# All requests include request ID in response headers
curl -v http://localhost:3000/api/health

# Look for: x-request-id: <uuid>
```

## Development Commands

### Run Tests
```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### Linting & Formatting
```bash
# Check linting
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format
```

### Build & Production
```bash
# Build TypeScript
npm run build

# Start production server
npm start

# Run in production mode
NODE_ENV=production npm start
```

## Monitoring

### View Logs
```bash
# Server logs are displayed in console
# Look for structured JSON logs with:
# - Request details (method, url, status, duration)
# - Business operations (adjustStock, reserveStock)
# - Error details with stack traces
# - Performance metrics
```

### Health Monitoring
```bash
# Check system health
curl http://localhost:3000/api/health

# Monitor metrics
watch -n 1 'curl -s http://localhost:3000/api/metrics | jq'
```

## Troubleshooting

### Common Issues

1. **Port already in use**
   ```bash
   # Kill existing process
   pkill -f "tsx src/server.ts"
   # Or use different port
   PORT=3001 npm run dev
   ```

2. **TypeScript compilation errors**
   ```bash
   # Check for type errors
   npx tsc --noEmit
   ```

3. **Test failures**
   ```bash
   # Run specific test file
   npm test tests/inventory.service.test.ts
   ```

4. **Metrics not updating**
   ```bash
   # Check if metrics route is registered
   curl -v http://localhost:3000/api/metrics
   ```

### Debug Mode
```bash
# Enable debug logging
LOG_LEVEL=debug npm run dev

# Enable trace logging
LOG_LEVEL=trace npm run dev
```

This comprehensive testing guide covers all aspects of the distributed inventory system, from basic operations to advanced concurrency testing and monitoring.