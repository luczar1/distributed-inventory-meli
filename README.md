# Distributed Inventory System

A **consistency-first** distributed inventory management system built with Node.js, TypeScript, and Express. This system prioritizes data consistency over availability, using optimistic concurrency control and per-key async mutexes to ensure inventory accuracy across multiple stores.

## Problem Summary

In a distributed e-commerce environment, maintaining accurate inventory counts across multiple stores is critical. The challenge is preventing overselling while handling concurrent operations from different clients. This system solves the **distributed inventory consistency problem** by ensuring that:

- Stock levels are always accurate across all stores
- Concurrent operations don't lead to race conditions
- System maintains consistency even during network partitions
- Operations are idempotent to handle retries safely

## Why Consistency-First?

This system prioritizes **consistency over availability** because:

1. **Business Critical**: Overselling inventory can lead to customer dissatisfaction and financial losses
2. **Data Integrity**: Inventory accuracy is more important than system availability
3. **Audit Requirements**: Financial and compliance needs require accurate stock records
4. **Customer Trust**: Consistent inventory builds customer confidence

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Distributed Inventory System                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │   Store A   │    │   Store B   │    │   Store C   │         │
│  │             │    │             │    │             │         │
│  │ ┌─────────┐ │    │ ┌─────────┐ │    │ ┌─────────┐ │         │
│  │ │Inventory│ │    │ │Inventory│ │    │ │Inventory│ │         │
│  │ │Service  │ │    │ │Service  │ │    │ │Service  │ │         │
│  │ └─────────┘ │    │ └─────────┘ │    │ └─────────┘ │         │
│  │             │    │             │    │             │         │
│  │ ┌─────────┐ │    │ ┌─────────┐ │    │ ┌─────────┐ │         │
│  │ │Per-Key   │ │    │ │Per-Key  │ │    │ │Per-Key│ │         │
│  │ │Mutex    │ │    │ │Mutex    │ │    │ │Mutex  │ │         │
│  │ └─────────┘ │    │ └─────────┘ │    │ └─────────┘ │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│           │                 │                 │                │
│           └─────────────────┼─────────────────┘                │
│                             │                                  │
│  ┌─────────────────────────────────────────────────────────────┤
│  │                Event Log (Append-Only)                     │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│  │  │Stock Adj.   │ │Stock Res.   │ │Stock Rel.   │          │
│  │  │Events       │ │Events       │ │Events       │          │
│  │  └─────────────┘ └─────────────┘ └─────────────┘          │
│  └─────────────────────────────────────────────────────────────┤
│                             │                                  │
│  ┌─────────────────────────────────────────────────────────────┤
│  │              Sync Worker (Periodic)                        │
│  │  ┌─────────────────────────────────────────────────────┐   │
│  │  │            Central Inventory Aggregator             │   │
│  │  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐  │   │
│  │  │  │Store A Agg. │ │Store B Agg. │ │Store C Agg. │  │   │
│  │  │  └─────────────┘ └─────────────┘ └─────────────┘  │   │
│  │  └─────────────────────────────────────────────────────┘   │
│  └─────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┤
│  │                    REST API Layer                          │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│  │  │Health       │ │Inventory    │ │Sync         │          │
│  │  │Endpoints    │ │Endpoints    │ │Endpoints    │          │
│  │  └─────────────┘ └─────────────┘ └─────────────┘          │
│  └─────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┤
│  │                Observability Layer                         │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│  │  │Request      │ │Metrics      │ │Error        │          │
│  │  │Logging      │ │Collection   │ │Tracking     │          │
│  │  └─────────────┘ └─────────────┘ └─────────────┘          │
│  └─────────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────┘
```

## API Endpoints

### Health Check
- `GET /api/health` - System health status with uptime and timestamp

### Inventory Management
- `GET /api/inventory/stores/:storeId/inventory/:sku` - Get inventory record with ETag
- `POST /api/inventory/stores/:storeId/inventory/:sku/adjust` - Adjust stock (supports idempotency)
- `POST /api/inventory/stores/:storeId/inventory/:sku/reserve` - Reserve stock (supports idempotency)

### Sync Operations
- `POST /api/sync` - Trigger manual sync
- `GET /api/sync/status` - Get sync worker status
- `POST /api/sync/start` - Start periodic sync with configurable interval
- `POST /api/sync/stop` - Stop periodic sync

### Metrics & Observability
- `GET /api/metrics` - Get comprehensive system metrics
- `POST /api/metrics/reset` - Reset metrics (testing only)

## Concurrency & Idempotency

### Per-Key Async Mutex
Each SKU has its own mutex to serialize write operations:
```typescript
await perKeyMutex.acquire(sku, async () => {
  // Only one operation per SKU at a time
  return await performStockOperation();
});
```

### Optimistic Concurrency Control
- Each inventory record has a `version` field
- Operations include `expectedVersion` parameter
- Version mismatches throw `ConflictError` (409)
- Successful operations increment version

### Idempotency Support
- All POST operations support `Idempotency-Key` header
- Repeated requests with same key return cached result
- Prevents duplicate operations from retries
- TTL-based cleanup of idempotency cache

### Example Flow
```typescript
// 1. Check idempotency
const existingResult = await idempotencyStore.get(key);
if (existingResult) return existingResult;

// 2. Acquire per-key mutex
await perKeyMutex.acquire(sku, async () => {
  // 3. Check version
  if (currentRecord.version !== expectedVersion) {
    throw ConflictError.versionMismatch(...);
  }
  
  // 4. Perform operation
  const newRecord = { ...currentRecord, version: currentRecord.version + 1 };
  
  // 5. Persist and cache result
  await inventoryRepository.upsert(newRecord);
  await idempotencyStore.set(key, result);
});
```

## Trade-offs

### ✅ Advantages
- **Strong Consistency**: No overselling possible
- **Audit Trail**: Complete event log for all operations
- **Fault Tolerance**: Idempotency handles retries safely
- **Observability**: Comprehensive metrics and logging
- **Scalability**: Per-key mutex allows parallel operations on different SKUs

### ❌ Disadvantages
- **Lower Availability**: System may reject operations during conflicts
- **Performance Impact**: Per-key mutex serializes operations per SKU
- **Complexity**: More complex than eventual consistency systems
- **Network Sensitivity**: Version conflicts increase with network latency

### 🔄 Consistency vs Availability
- **CP System**: Chooses Consistency and Partition tolerance
- **Rejects operations** during version conflicts
- **Prioritizes data accuracy** over system availability
- **Suitable for** financial and inventory-critical applications

## Technology Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Validation**: Zod schemas
- **Logging**: Pino structured logging
- **Testing**: Vitest + Supertest
- **Concurrency**: Custom per-key async mutex
- **Persistence**: JSON files (simulated database)
- **Observability**: Custom metrics collection

## Key Features

- 🔒 **Optimistic Concurrency Control** with version-based conflict detection
- 🔄 **Per-Key Async Mutex** for SKU-level operation serialization
- 🛡️ **Idempotency Support** with TTL-based caching
- 📊 **Comprehensive Observability** with request logging and metrics
- 🧪 **306 Passing Tests** with comprehensive unit and integration coverage
- 📝 **Event Sourcing** with append-only event log
- 🔄 **Distributed Sync** with periodic central aggregation
- ⚡ **Fault Tolerance** with retry logic and error handling
- 🏗️ **Clean Architecture** with all files under 200 LOC limit
- 🔧 **Enterprise Quality** with ESLint, Prettier, and TypeScript strict mode

## Getting Started

See [run.md](./run.md) for detailed setup and testing instructions.

## Architecture Details

See [ARCHITECTURE.md](./ARCHITECTURE.md) for distributed system design and failure modes.

## Development History

See [prompts.md](./prompts.md) for all GenAI/Cursor prompts used in development.