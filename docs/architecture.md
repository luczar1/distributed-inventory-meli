# Distributed Inventory System Architecture

## Overview

The Distributed Inventory System is designed to handle concurrent inventory operations across multiple stores while maintaining data consistency and preventing stock discrepancies. The system prioritizes **consistency over availability** to ensure accurate inventory tracking.

## Core Design Principles

### 1. Consistency Over Availability
- **Rationale**: Stock discrepancies lead to lost sales and customer dissatisfaction
- **Implementation**: Optimistic concurrency control with version checking
- **Trade-offs**: Potential operation failures during high contention

### 2. Optimistic Concurrency Control
- **Per-SKU Versioning**: Each inventory item has a version number
- **Version Checking**: Operations verify version before execution
- **Conflict Resolution**: Version mismatches result in operation failure

### 3. Per-Key Serialization
- **Async Mutex**: Per-SKU mutex prevents concurrent writes
- **Write Serialization**: All operations on the same SKU are serialized
- **Read Concurrency**: Multiple reads can occur simultaneously

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Client Layer                             │
├─────────────────────────────────────────────────────────────┤
│  REST API Endpoints  │  Health Checks  │  Metrics/Monitoring │
├─────────────────────────────────────────────────────────────┤
│                    Controller Layer                         │
├─────────────────────────────────────────────────────────────┤
│  Inventory Controller  │  Metrics Controller  │  Error Handler │
├─────────────────────────────────────────────────────────────┤
│                    Service Layer                            │
├─────────────────────────────────────────────────────────────┤
│  Inventory Service  │  Concurrency Control  │  Persistence   │
├─────────────────────────────────────────────────────────────┤
│                    Data Layer                               │
├─────────────────────────────────────────────────────────────┤
│  JSON File Storage  │  Logging  │  Metrics Collection       │
└─────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Data Models

#### InventoryItem
- **Purpose**: Represents a single inventory item
- **Key Properties**: SKU, name, quantity, reserved, version
- **Methods**: add(), remove(), reserve(), release()
- **Validation**: Built-in data validation and constraints

#### InventoryOperation
- **Purpose**: Tracks inventory operations with idempotency
- **Key Properties**: type, sku, amount, idempotencyKey, status
- **States**: pending, completed, failed, cancelled
- **Retry Logic**: Configurable retry attempts with backoff

#### Store
- **Purpose**: Represents a store in the distributed system
- **Key Properties**: id, name, location, syncInterval
- **Sync Management**: Tracks last sync and sync requirements

### 2. Concurrency Control

#### Optimistic Locking
```javascript
// Version checking before operations
if (!this.checkVersion(sku, expectedVersion)) {
  throw new ConcurrencyError('Version mismatch');
}
```

#### Per-Key Mutex
```javascript
// Serialize operations per SKU
const mutex = this.getMutex(sku);
return await mutex.runExclusive(async () => {
  // Critical section
});
```

#### Version Management
- **Increment**: Version incremented after successful operations
- **Tracking**: Centralized version tracking per SKU
- **Conflict Detection**: Version comparison before operations

### 3. Persistence Layer

#### JSON File Storage
- **Atomic Operations**: Write to temporary file, then rename
- **Fault Tolerance**: Retry mechanisms with exponential backoff
- **Data Integrity**: Checksums and validation on read/write

#### File Structure
```
data/
├── inventory_default.json    # Main inventory data
├── inventory_store1.json     # Store-specific data
└── logs/                     # Application logs
    ├── combined.log
    └── error.log
```

### 4. API Layer

#### REST Endpoints
- **Inventory Operations**: CRUD operations for inventory items
- **Reservation System**: Reserve and release inventory
- **Monitoring**: Health checks and metrics
- **Idempotency**: Support for idempotent operations

#### Error Handling
- **Custom Error Classes**: Specific error types with context
- **HTTP Status Codes**: Appropriate status codes for different errors
- **Error Logging**: Comprehensive error tracking and logging

## Data Flow

### 1. Add Inventory Item
```
Client → API → Controller → Service → Concurrency Control → Persistence
```

### 2. Reserve Inventory
```
Client → API → Controller → Service → Mutex → Version Check → Persistence
```

### 3. Concurrent Operations
```
Operation 1: SKU-A → Mutex-A → Version Check → Execute → Update Version
Operation 2: SKU-A → Mutex-A → Wait → Version Check → Execute
Operation 3: SKU-B → Mutex-B → Version Check → Execute (Parallel)
```

## Concurrency Scenarios

### Scenario 1: Concurrent Reserves
```
Time 1: User A reserves 10 units of SKU-001
Time 2: User B reserves 5 units of SKU-001
Result: Both operations serialized, no race condition
```

### Scenario 2: Version Conflict
```
Time 1: Operation A reads SKU-001 (version 5)
Time 2: Operation B updates SKU-001 (version 6)
Time 3: Operation A tries to update (version 5 ≠ 6)
Result: Operation A fails with version conflict
```

### Scenario 3: Different SKUs
```
Time 1: Operation A on SKU-001 (Mutex-A)
Time 2: Operation B on SKU-002 (Mutex-B)
Result: Both operations execute in parallel
```

## Fault Tolerance

### 1. Idempotency
- **Idempotency Keys**: Unique keys for operation deduplication
- **Operation Tracking**: Store and track operation status
- **Duplicate Prevention**: Reject duplicate operations

### 2. Retry Mechanisms
- **Exponential Backoff**: Increasing delays between retries
- **Max Retries**: Configurable retry limits
- **Failure Handling**: Graceful degradation on persistent failures

### 3. Data Consistency
- **Atomic Writes**: All-or-nothing file operations
- **Version Validation**: Ensure data integrity
- **Recovery Procedures**: Handle partial failures

## Performance Characteristics

### Throughput
- **Read Operations**: High concurrency, no locking
- **Write Operations**: Serialized per SKU, limited by I/O
- **Mixed Workloads**: Optimized for read-heavy scenarios

### Latency
- **Read Latency**: Sub-millisecond for in-memory operations
- **Write Latency**: 10-50ms depending on I/O performance
- **Concurrency Impact**: Minimal impact from per-SKU mutex

### Scalability
- **Horizontal**: Multiple instances with shared data directory
- **Vertical**: Limited by single-threaded Node.js event loop
- **Bottlenecks**: File I/O and mutex contention

## Monitoring and Observability

### Metrics Collected
- **Request Metrics**: Total, successful, failed requests
- **Inventory Metrics**: Operation counts, stock levels
- **Concurrency Metrics**: Active mutexes, conflicts, queued operations
- **System Metrics**: Memory usage, CPU, file I/O

### Health Checks
- **Basic Health**: Service availability and uptime
- **Detailed Health**: Memory usage, error rates, performance
- **Business Health**: Inventory accuracy, operation success rates

### Logging
- **Structured Logging**: JSON format with context
- **Log Levels**: Error, warn, info, debug
- **Request Tracing**: Unique request IDs for correlation

## Security Considerations

### Input Validation
- **Schema Validation**: Joi schemas for all inputs
- **Type Checking**: Strict type validation
- **Range Validation**: Quantity and SKU format validation

### Error Handling
- **Information Disclosure**: No sensitive data in error messages
- **Error Logging**: Detailed errors logged internally
- **User Feedback**: Generic error messages for users

### Access Control
- **CORS Configuration**: Configurable allowed origins
- **Rate Limiting**: Protection against abuse
- **Input Sanitization**: Prevent injection attacks

## Deployment Architecture

### Single Instance
```
┌─────────────────┐
│   Load Balancer │
└─────────────────┘
         │
┌─────────────────┐
│  Inventory API  │
└─────────────────┘
         │
┌─────────────────┐
│   Data Storage  │
└─────────────────┘
```

### Multi-Instance
```
┌─────────────────┐
│   Load Balancer │
└─────────────────┘
         │
    ┌────┴────┐
    │         │
┌───▼───┐ ┌───▼───┐
│ API 1 │ │ API 2 │
└───┬───┘ └───┬───┘
    │         │
    └────┬────┘
         │
┌─────────────────┐
│ Shared Storage  │
└─────────────────┘
```

## Future Enhancements

### 1. Database Integration
- **PostgreSQL**: ACID compliance and better concurrency
- **Redis**: Caching layer for improved performance
- **MongoDB**: Document-based storage for flexibility

### 2. Distributed Architecture
- **Microservices**: Separate services for different concerns
- **Message Queues**: Asynchronous operation processing
- **Event Sourcing**: Audit trail and replay capabilities

### 3. Advanced Features
- **Real-time Sync**: WebSocket-based live updates
- **Batch Operations**: Bulk inventory operations
- **Analytics**: Inventory trends and predictions

## Trade-offs and Limitations

### Current Limitations
- **Single-threaded**: Limited by Node.js event loop
- **File I/O**: Bottleneck for high-throughput scenarios
- **Memory Usage**: All data loaded into memory
- **No Transactions**: Limited atomicity guarantees

### Design Trade-offs
- **Consistency vs Availability**: Chose consistency
- **Performance vs Safety**: Chose safety with mutexes
- **Simplicity vs Features**: Chose simplicity for reliability
- **Development vs Production**: Optimized for development ease

## Conclusion

The Distributed Inventory System provides a robust foundation for inventory management with strong consistency guarantees. The architecture prioritizes data integrity over performance, making it suitable for scenarios where stock accuracy is critical. The system's design allows for future enhancements while maintaining the core principles of consistency and reliability.
