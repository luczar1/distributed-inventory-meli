# Distributed Inventory System

A robust, distributed inventory management system built with Node.js, featuring optimistic concurrency control, fault tolerance, and comprehensive observability.

## Features

- **Optimistic Concurrency Control**: Per-SKU versioning to prevent race conditions
- **Async Mutex**: Per-key serialization for write operations
- **Fault Tolerance**: Retry mechanisms, idempotency keys, and atomic operations
- **REST API**: Complete CRUD operations for inventory management
- **Observability**: Comprehensive metrics, logging, and monitoring
- **Clean Code**: ESLint enforcement with max-lines rule (200 lines per file)
- **Comprehensive Testing**: Unit and integration tests with Jest

## Architecture

The system prioritizes **consistency over availability** to prevent stock discrepancies. It uses:

- **Optimistic Locking**: Version-based concurrency control per SKU
- **Per-Key Mutex**: Serializes conflicting writes to the same SKU
- **JSON File Persistence**: Simulates database with local file storage
- **Idempotency**: Prevents duplicate operations with unique keys
- **Retry Logic**: Exponential backoff for failed operations

## Quick Start

### Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd distributed-inventory-meli

# Install dependencies
npm install

# Start the server
npm start
```

### Development

```bash
# Run in development mode with auto-reload
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix
```

## API Endpoints

### Inventory Operations

- `POST /api/inventory/items` - Add new inventory item
- `GET /api/inventory/items` - Get all inventory items
- `GET /api/inventory/items/:sku` - Get specific item by SKU
- `PUT /api/inventory/items/:sku/quantity` - Update item quantity
- `POST /api/inventory/items/:sku/reserve` - Reserve inventory
- `POST /api/inventory/items/:sku/release` - Release reserved inventory

### Monitoring

- `GET /api/metrics` - Get all metrics
- `GET /api/metrics/health` - Health check
- `GET /api/metrics/requests` - Request metrics
- `GET /api/metrics/inventory` - Inventory metrics
- `GET /api/metrics/concurrency` - Concurrency metrics
- `GET /api/metrics/persistence` - Persistence metrics
- `GET /api/metrics/system` - System metrics

### General

- `GET /health` - Basic health check
- `GET /` - API information

## Usage Examples

### Adding Inventory

```bash
curl -X POST http://localhost:3000/api/inventory/items \
  -H "Content-Type: application/json" \
  -d '{
    "sku": "LAPTOP-001",
    "name": "Gaming Laptop",
    "quantity": 50,
    "idempotencyKey": "add-laptop-001"
  }'
```

### Reserving Inventory

```bash
curl -X POST http://localhost:3000/api/inventory/items/LAPTOP-001/reserve \
  -H "Content-Type: application/json" \
  -d '{
    "quantity": 2,
    "idempotencyKey": "reserve-laptop-001"
  }'
```

### Checking Metrics

```bash
curl http://localhost:3000/api/metrics/health
```

## Configuration

### Environment Variables

- `PORT` - Server port (default: 3000)
- `HOST` - Server host (default: 0.0.0.0)
- `LOG_LEVEL` - Logging level (default: info)
- `DATA_DIR` - Data directory for persistence (default: ./data)
- `ALLOWED_ORIGINS` - CORS allowed origins (comma-separated)

### Data Directory Structure

```
data/
├── inventory_default.json    # Main inventory data
├── inventory_store1.json     # Store-specific data
└── logs/                     # Application logs
    ├── combined.log
    └── error.log
```

## Concurrency Control

The system implements two levels of concurrency control:

### 1. Optimistic Locking
- Each SKU has a version number
- Operations check version before execution
- Version conflicts result in operation failure
- Prevents lost updates in concurrent scenarios

### 2. Per-Key Mutex
- Async mutex per SKU
- Serializes all write operations for the same SKU
- Prevents race conditions during concurrent access
- Maintains data consistency

## Error Handling

The system provides comprehensive error handling:

- **Validation Errors**: Input validation with detailed messages
- **Concurrency Errors**: Version mismatch detection
- **Not Found Errors**: Resource not found scenarios
- **Insufficient Quantity**: Stock availability checks
- **Persistence Errors**: File operation failures

All errors include:
- Error type and message
- HTTP status code
- Timestamp
- Context information (SKU, operation, etc.)

## Monitoring and Observability

### Metrics Collected

- **Request Metrics**: Total, successful, failed requests by method/endpoint
- **Inventory Metrics**: Operation counts, stock levels
- **Concurrency Metrics**: Active mutexes, queued operations, conflicts
- **Persistence Metrics**: Read/write operations, failures, retries
- **System Metrics**: Memory usage, uptime, CPU

### Logging

- **Structured Logging**: JSON format with Winston
- **Log Levels**: Error, warn, info, debug
- **File Rotation**: Automatic log rotation (5MB, 5 files)
- **Request Tracking**: Unique request IDs for tracing

## Testing

The test suite includes:

- **Unit Tests**: Model and service layer testing
- **Integration Tests**: API endpoint testing
- **Concurrency Tests**: Race condition verification
- **Error Handling Tests**: Exception scenario coverage

Run tests with:

```bash
npm test                    # Run all tests
npm run test:watch         # Watch mode
npm run test:coverage      # Coverage report
```

## Performance Considerations

- **File I/O**: Atomic writes with temporary files
- **Memory Usage**: Efficient data structures and cleanup
- **Concurrency**: Minimal lock contention with per-SKU mutexes
- **Retry Logic**: Exponential backoff to prevent thundering herd

## Security

- **Input Validation**: Joi schema validation
- **CORS Protection**: Configurable allowed origins
- **Helmet**: Security headers
- **Error Sanitization**: No sensitive data in error responses

## Contributing

1. Follow ESLint rules (max 200 lines per file)
2. Write tests for new features
3. Update documentation
4. Ensure all tests pass

## License

MIT License - see LICENSE file for details.
