import { SKU, StoreId, Version } from './types';

// Base domain error class
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
  readonly timestamp: string;

  constructor(message: string, public readonly details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date().toISOString();
  }
}

// Conflict error for version mismatches (409)
export class ConflictError extends DomainError {
  readonly code = 'CONFLICT_ERROR';
  readonly statusCode = 409;

  constructor(
    message: string,
    public readonly sku: SKU,
    public readonly storeId: StoreId,
    public readonly expectedVersion?: Version,
    public readonly actualVersion?: Version,
    details?: Record<string, unknown>
  ) {
    super(message, details);
  }

  static versionMismatch(
    sku: SKU,
    storeId: StoreId,
    expectedVersion: Version,
    actualVersion: Version
  ): ConflictError {
    return new ConflictError(
      `Version mismatch for SKU ${sku} in store ${storeId}. Expected: ${expectedVersion}, Actual: ${actualVersion}`,
      sku,
      storeId,
      expectedVersion,
      actualVersion,
      { expectedVersion, actualVersion }
    );
  }
}

// Validation error for invalid input (400)
export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_ERROR';
  readonly statusCode = 400;

  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown,
    details?: Record<string, unknown>
  ) {
    super(message, { field, value, ...details });
  }

  static invalidSKU(sku: string): ValidationError {
    return new ValidationError(
      `Invalid SKU format: ${sku}. SKU must be 1-50 characters long.`,
      'sku',
      sku
    );
  }

  static invalidStoreId(storeId: string): ValidationError {
    return new ValidationError(
      `Invalid store ID format: ${storeId}. Store ID must be 1-20 characters long.`,
      'storeId',
      storeId
    );
  }

  static invalidQuantity(quantity: number): ValidationError {
    return new ValidationError(
      `Invalid quantity: ${quantity}. Quantity must be a non-negative integer.`,
      'quantity',
      quantity
    );
  }

  static invalidVersion(version: number): ValidationError {
    return new ValidationError(
      `Invalid version: ${version}. Version must be a positive integer.`,
      'version',
      version
    );
  }

  static missingField(field: string): ValidationError {
    return new ValidationError(`Missing required field: ${field}`, field);
  }
}

// Not found error for missing resources (404)
export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND_ERROR';
  readonly statusCode = 404;

  constructor(
    message: string,
    public readonly resourceType: string,
    public readonly identifier: string,
    details?: Record<string, unknown>
  ) {
    super(message, { resourceType, identifier, ...details });
  }

  static inventoryRecord(sku: SKU, storeId: StoreId): NotFoundError {
    return new NotFoundError(
      `Inventory record not found for SKU ${sku} in store ${storeId}`,
      'InventoryRecord',
      `${sku}:${storeId}`,
      { sku, storeId }
    );
  }

  static store(storeId: StoreId): NotFoundError {
    return new NotFoundError(
      `Store not found: ${storeId}`,
      'Store',
      storeId,
      { storeId }
    );
  }
}

// Idempotency conflict error (409)
export class IdempotencyConflictError extends DomainError {
  readonly code = 'IDEMPOTENCY_CONFLICT_ERROR';
  readonly statusCode = 409;

  constructor(
    message: string,
    public readonly idempotencyKey: string,
    public readonly existingOperation?: string,
    details?: Record<string, unknown>
  ) {
    super(message, { idempotencyKey, existingOperation, ...details });
  }

  static duplicateOperation(
    idempotencyKey: string,
    existingOperation: string
  ): IdempotencyConflictError {
    return new IdempotencyConflictError(
      `Operation with idempotency key ${idempotencyKey} already exists: ${existingOperation}`,
      idempotencyKey,
      existingOperation,
      { idempotencyKey, existingOperation }
    );
  }
}

// Business logic errors
export class InsufficientStockError extends DomainError {
  readonly code = 'INSUFFICIENT_STOCK_ERROR';
  readonly statusCode = 422;

  constructor(
    message: string,
    public readonly sku: SKU,
    public readonly storeId: StoreId,
    public readonly requested: number,
    public readonly available: number,
    details?: Record<string, unknown>
  ) {
    super(message, { sku, storeId, requested, available, ...details });
  }

  static reserve(sku: SKU, storeId: StoreId, requested: number, available: number): InsufficientStockError {
    return new InsufficientStockError(
      `Insufficient stock to reserve ${requested} units of ${sku} in store ${storeId}. Available: ${available}`,
      sku, storeId, requested, available
    );
  }
}

export class LockRejectionError extends Error {
  public readonly sku: string;
  public readonly retryAfter: number;

  constructor(sku: string, retryAfter: number, message: string) {
    super(message);
    this.name = 'LockRejectionError';
    this.sku = sku;
    this.retryAfter = retryAfter;
  }
}

// Error factory for creating standardized error responses
export class ErrorFactory {
  static createErrorResponse(error: DomainError) {
    return {
      success: false as const,
      error: {
        name: error.name,
        message: error.message,
        code: error.code,
        statusCode: error.statusCode,
        timestamp: error.timestamp,
        details: error.details,
      },
    };
  }
}
