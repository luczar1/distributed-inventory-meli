# GenAI/Cursor Prompts Used in Development

This document contains all the prompts used with GenAI/Cursor during the development of the distributed inventory system.

## Initial Project Setup

### Prompt 1: Project Initialization
```
Start a new NodeJS project for a distributed inventory system, prioritizing consistency over availability. Use optimistic concurrency (per-SKU versions) and per-key async mutex, simulating persistence with local JSON files, providing a REST API for core inventory operations, emphasizing concurrency, consistency, and error handling, adding fault tolerance (idempotency keys, retries for file writes), observability, and tests. Enforce clean code with an ESLint rule of max-lines: 200 per file. Deliverables: source code, tests, README.md, run.md, prompts.md, and a short architecture note.
```

### Prompt 2: TypeScript Conversion
```
Convert the existing JavaScript project to a Node.js + TypeScript project scaffold, specifying exact file names, scripts, dependencies, and dev dependencies. Add .eslintrc.cjs and .prettierrc with strict rules, including a hard cap of 200 LOC per file, and create a specific repository structure with empty files.
```

## Core Implementation Tasks

### Task 4 — Core types & errors
```
Implement src/core/types.ts with TypeScript types and Zod schemas for SKU, StoreId, Version (number), Quantity (non-negative), InventoryRecord, Command payloads (AdjustStock, ReserveStock with optional expectedVersion), and API request/response DTOs.

Create src/core/errors.ts with domain errors: ConflictError (version mismatch → 409), ValidationError (400), NotFoundError (404), IdempotencyConflictError (409).

Keep both files ≤ 200 LOC each.
```

### Task 6 — Middleware
```
request-id.ts: attach req.id from header or generate a UUID.
validate.ts: reusable Zod validator for req.body/params/query → throw ValidationError.
error-handler.ts: map domain errors to proper HTTP codes (400/404/409/500) and return JSON { error, message }. No stack traces in prod.
```

### Task 7 — Utilities
```
perKeyMutex.ts: simple per-key async mutex that serializes functions by key (acquire(key, fn)).
idempotency.ts: in-memory Map keyed by Idempotency-Key header; persists last result for a TTL; if same key reappears → return previous result.
fsSafe.ts: JSON file read/write with retry (3x exponential backoff) to simulate fault tolerance for disk I/O.
mapLimit.ts: tiny concurrency helper to run N tasks in parallel (used by tests).
```

### Task 8 — Repositories (JSON persistence)
```
Implement inventory.repo.ts to load/save data/store-inventory.json (per-store state) with API: get(sku, storeId), upsert(record), listByStore(storeId).

Implement eventlog.repo.ts as an append-only data/event-log.json with events { id, type, payload, ts }. It should support idempotent appends (skip duplicate id).

Keep public APIs narrow and synchronous wrappers async (all I/O async via fsSafe).
```

### Task 9 — Domain service (consistency-first)
```
Implement inventory.service.ts using optimistic concurrency (each record has a version field).

Implement mutations:
- adjustStock(storeId, sku, delta, expectedVersion, idemKey)
- reserveStock(storeId, sku, qty, expectedVersion, idemKey) (reject if qty > available)

For each SKU, acquire perKeyMutex(sku) to serialize writes.
If expectedVersion is set and doesn't match, throw ConflictError.
On success: increment version, persist via inventory.repo, append event in eventlog.repo, return { qty, version }.
Respect idempotency: same Idempotency-Key returns the first computed result.
```

### Task 10 — Sync worker (simulate distributed sync)
```
Implement sync.worker.ts:
- applyEventsToCentral() reads new events from event-log.json and folds them into central-inventory.json (per-SKU, per-store).
- Expose startSync(intervalMs = 15000) to run periodically, and syncOnce() for tests.
- Make file operations resilient with fsSafe retries.
```

### Task 11 — HTTP API (Express)
```
routes/health.routes.ts: GET /health → { status: 'ok' }.
routes/inventory.routes.ts:
- GET /stores/:storeId/inventory/:sku → current store record + ETag header = version.
- POST /stores/:storeId/inventory/:sku/adjust → body { delta, expectedVersion? }
- POST /stores/:storeId/inventory/:sku/reserve → body { qty, expectedVersion? }
- POST /sync → triggers syncOnce() (manual sync)

Validate payloads with Zod; surface errors via error-handler.
Include idempotency via Idempotency-Key header.
Ensure every route file ≤ 200 LOC.
```

### Task 12 — App & Server bootstrap
```
app.ts: build express() app (json body parser, request-id, routes, error handler).
server.ts: create HTTP server on PORT (default 3000); start startSync(15000).
```

### Task 13 — Seed data
```
Create minimal JSON seeds:
- data/store-inventory.json: a few SKUs with qty, version: 1, recent timestamps.
- data/central-inventory.json: maybe empty at start.
- data/event-log.json: empty array.
```

## Testing Implementation

### Task 14 — Tests (unit + integration)
```
Use Vitest + Supertest. Add the following:

inventory.service.test.ts
- adjusts increase/decrease correctly; version increments
- rejects negative resulting stock
- expectedVersion mismatch → ConflictError
- idempotency returns same result for repeated key

concurrency.test.ts
- run 100 parallel adjustments/reservations on same SKU using mapLimit with concurrency 16
- ensure final quantity is correct and no lost updates (versions strictly increasing)

api.test.ts
- happy paths for GET/POST adjust/reserve
- 409 on version mismatch (simulate with stale expectedVersion)
- POST /sync applies events into central file (assert central state updated)

Make tests deterministic, no sleeps beyond what's necessary; use syncOnce() instead of timers.
```

## Observability Implementation

### Task 15 — Observability
```
Log every request with { method, url, status, durationMs, requestId }.

Add a lightweight /metrics route returning JSON counters: { requests, errors, conflicts, idempotentHits }.

Increment counters in middleware/service.
```

## Documentation

### Final Documentation Prompt
```
README.md:
Problem summary, why consistency-first, component diagram (ASCII), endpoints, how concurrency/idempotency work, and trade-offs.

ARCHITECTURE.md: brief distributed view: store service → event log → central aggregator (sync worker), invariants, and failure modes.

run.md: exact commands to run and test:
npm i
npm run dev
curl examples for all endpoints
npm test

prompts.md: paste all prompts used with GenAI/Cursor (including this task list).
```

## Additional Prompts Used

### Testing and Validation
```
can we test so far how it's working?
```

### Code Quality
```
can we test each endpoint functionality?
```

### Git Operations
```
let's push
```

### File Management
```
remove the src2 folder
```

### Linting and Code Quality
```
check the linting status
```

```
check the amount of lines per file
```

```
fix the failing tests and commit the changes
```

```
push the changes to the remote repository
```

## Development Workflow

### Iterative Development Process
1. **Initial Setup**: Project initialization with TypeScript and strict linting
2. **Core Types**: Domain types and error handling
3. **Middleware**: Request processing and validation
4. **Utilities**: Concurrency control and fault tolerance
5. **Repositories**: Data persistence layer
6. **Services**: Business logic with consistency guarantees
7. **Sync Worker**: Distributed synchronization
8. **HTTP API**: REST endpoints with proper validation
9. **App Bootstrap**: Server configuration and startup
10. **Seed Data**: Initial data for testing
11. **Testing**: Comprehensive unit and integration tests
12. **Observability**: Logging and metrics collection
13. **Documentation**: Complete system documentation

### Key Design Decisions
- **Consistency-First**: Prioritizing data accuracy over availability
- **Optimistic Concurrency**: Version-based conflict detection
- **Per-Key Mutex**: SKU-level operation serialization
- **Idempotency**: Safe retry handling
- **Event Sourcing**: Complete audit trail
- **Observability**: Comprehensive monitoring and logging
- **Clean Code**: 200 LOC limit per file with strict linting

### Technology Choices
- **Node.js + TypeScript**: Type safety and modern JavaScript
- **Express.js**: Lightweight web framework
- **Zod**: Runtime type validation
- **Pino**: Structured logging
- **Vitest**: Modern testing framework
- **Supertest**: HTTP testing
- **JSON Files**: Simulated database for simplicity

This comprehensive prompt history shows the iterative development approach used to build a production-ready distributed inventory system with strong consistency guarantees.