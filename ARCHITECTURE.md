# Distributed Inventory System Architecture

## Distributed System Overview

This system implements a **consistency-first distributed inventory architecture** with the following components:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Distributed Architecture                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │ Store Node  │    │ Store Node  │    │ Store Node  │         │
│  │     A       │    │     B       │    │     C       │         │
│  │             │    │             │    │             │         │
│  │ ┌─────────┐ │    │ ┌─────────┐ │    │ ┌─────────┐ │         │
│  │ │Local    │ │    │ │Local    │ │    │ │Local    │ │         │
│  │ │Inventory│ │    │ │Inventory│ │    │ │Inventory│ │         │
│  │ │State    │ │    │ │State    │ │    │ │State    │ │         │
│  │ └─────────┘ │    │ └─────────┘ │    │ └─────────┘ │         │
│  │             │    │             │    │             │         │
│  │ ┌─────────┐ │    │ ┌─────────┐ │    │ ┌─────────┐ │         │
│  │ │Event    │ │    │ │Event    │ │    │ │Event    │ │         │
│  │ │Generator│ │    │ │Generator│ │    │ │Generator│ │         │
│  │ └─────────┘ │    │ └─────────┘ │    │ └─────────┘ │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│           │                 │                 │                │
│           └─────────────────┼─────────────────┘                │
│                             │                                  │
│  ┌─────────────────────────────────────────────────────────────┤
│  │              Central Event Log (Shared)                    │
│  │  ┌─────────────────────────────────────────────────────┐   │
│  │  │            Append-Only Event Stream                │   │
│  │  │  [Event1] → [Event2] → [Event3] → [Event4] → ... │   │
│  │  │  • Stock Adjustments                               │   │
│  │  │  • Stock Reservations                              │   │
│  │  │  • Stock Releases                                  │   │
│  │  │  • Version Conflicts                               │   │
│  │  └─────────────────────────────────────────────────────┘   │
│  └─────────────────────────────────────────────────────────────┤
│                             │                                  │
│  ┌─────────────────────────────────────────────────────────────┤
│  │              Central Aggregator (Sync Worker)              │
│  │  ┌─────────────────────────────────────────────────────┐   │
│  │  │            Event Processing Engine                 │   │
│  │  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐  │   │
│  │  │  │Store A      │ │Store B      │ │Store C      │  │   │
│  │  │  │Aggregator   │ │Aggregator   │ │Aggregator   │  │   │
│  │  │  └─────────────┘ └─────────────┘ └─────────────┘  │   │
│  │  │  ┌─────────────────────────────────────────────┐  │   │
│  │  │  │        Global Inventory View               │  │   │
│  │  │  │  SKU123: { A: 50, B: 30, C: 20, Total: 100 }│  │   │
│  │  │  └─────────────────────────────────────────────┘  │   │
│  │  └─────────────────────────────────────────────────────┘   │
│  └─────────────────────────────────────────────────────────────┤
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Store Service Operations
```
Client Request → Store Service → Per-Key Mutex → Version Check → Operation → Event Log
```

### 2. Event Log Processing
```
Event Log → Sync Worker → Central Aggregator → Global View Update
```

### 3. Consistency Enforcement
```
Concurrent Operations → Per-Key Serialization → Version Validation → Conflict Resolution
```

## System Invariants

### 1. **Inventory Consistency Invariant**
- **Rule**: `sum(store_inventory[sku]) = central_inventory[sku]` for all SKUs
- **Enforcement**: Sync worker aggregates all store events into central view
- **Violation**: Manual reconciliation required if events are lost

### 2. **Version Monotonicity Invariant**
- **Rule**: `record.version` always increases for each SKU
- **Enforcement**: Per-key mutex ensures sequential version increments
- **Violation**: ConflictError thrown, operation rejected

### 3. **Non-Negative Stock Invariant**
- **Rule**: `inventory.qty >= 0` for all records
- **Enforcement**: Business logic validation before persistence
- **Violation**: InsufficientStockError thrown, operation rejected

### 4. **Idempotency Invariant**
- **Rule**: Same `Idempotency-Key` always returns same result
- **Enforcement**: Idempotency store caches results with TTL
- **Violation**: Duplicate operations possible, business impact

### 5. **Event Ordering Invariant**
- **Rule**: Events processed in chronological order per SKU
- **Enforcement**: Per-key mutex serializes operations
- **Violation**: Race conditions, data inconsistency

## Failure Modes & Recovery

### 1. **Store Node Failure**
```
Failure: Store node becomes unavailable
Impact: Local inventory operations fail
Recovery: 
  - Health checks detect failure
  - Load balancer routes to healthy nodes
  - Event log continues processing
  - Manual inventory reconciliation
```

### 2. **Event Log Corruption**
```
Failure: Event log file corrupted or lost
Impact: Central aggregator cannot process events
Recovery:
  - Restore from backup event log
  - Replay events from store states
  - Manual reconciliation of discrepancies
  - System restart with clean state
```

### 3. **Network Partition**
```
Failure: Store nodes cannot communicate
Impact: Operations may be rejected due to version conflicts
Recovery:
  - Wait for network restoration
  - Automatic retry of failed operations
  - Manual conflict resolution if needed
  - Sync worker catches up on missed events
```

### 4. **Central Aggregator Failure**
```
Failure: Sync worker stops processing events
Impact: Central view becomes stale
Recovery:
  - Restart sync worker
  - Process backlog of events
  - Validate central view against store states
  - Manual reconciliation if discrepancies found
```

### 5. **Version Conflict Cascade**
```
Failure: High contention on popular SKUs
Impact: Many operations rejected with ConflictError
Recovery:
  - Implement exponential backoff
  - Queue operations for retry
  - Consider SKU sharding
  - Manual conflict resolution
```

### 6. **Idempotency Store Overflow**
```
Failure: Idempotency cache grows too large
Impact: Memory exhaustion, performance degradation
Recovery:
  - Implement TTL-based cleanup
  - Limit cache size with LRU eviction
  - Monitor memory usage
  - Restart service if needed
```

## Consistency Guarantees

### **Strong Consistency**
- All operations see the latest version of data
- No stale reads possible
- Version conflicts prevent inconsistent updates

### **Eventual Consistency**
- Central aggregator eventually reflects all store changes
- Sync worker processes events in order
- Global view converges to true state

### **Causal Consistency**
- Operations within same SKU are causally ordered
- Per-key mutex ensures sequential processing
- Version numbers provide causal ordering

## Scalability Considerations

### **Horizontal Scaling**
- Each store node can be scaled independently
- Event log can be sharded by time or SKU
- Central aggregator can be replicated

### **Performance Bottlenecks**
- Per-key mutex serializes operations per SKU
- Event log append-only operations
- Central aggregator processing rate

### **Optimization Strategies**
- SKU-based sharding for high-contention items
- Batch event processing in sync worker
- Caching frequently accessed inventory data
- Asynchronous event processing

## Monitoring & Observability

### **Key Metrics**
- Request latency and throughput
- Version conflict rates
- Event processing lag
- Idempotency hit rates
- Error rates by operation type

### **Alerting Thresholds**
- High version conflict rate (>10%)
- Event processing lag (>5 minutes)
- Error rate spike (>5%)
- Memory usage >80%
- Request latency >95th percentile (>1 second)

### **Health Checks**
- Store service availability
- Event log accessibility
- Sync worker status
- Central aggregator health
- Database connectivity

## Security Considerations

### **Data Protection**
- Encrypt event log at rest
- Secure API endpoints with authentication
- Audit trail for all operations
- Rate limiting for API endpoints

### **Access Control**
- Role-based access to inventory operations
- Store-specific data isolation
- Admin-only sync operations
- Metrics endpoint protection

This architecture provides a robust, consistent, and observable distributed inventory system suitable for production e-commerce environments.