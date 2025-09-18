/**
 * Custom Error Classes
 * Centralized error handling for the inventory system
 */

/**
 * Base inventory error
 */
class InventoryError extends Error {
  constructor(message, code = 'INVENTORY_ERROR', statusCode = 500) {
    super(message);
    this.name = 'InventoryError';
    this.code = code;
    this.statusCode = statusCode;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Concurrency error
 */
class ConcurrencyError extends InventoryError {
  constructor(message, sku, expectedVersion, currentVersion) {
    super(message, 'CONCURRENCY_ERROR', 409);
    this.name = 'ConcurrencyError';
    this.sku = sku;
    this.expectedVersion = expectedVersion;
    this.currentVersion = currentVersion;
  }
}

/**
 * Validation error
 */
class ValidationError extends InventoryError {
  constructor(message, field = null) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * Not found error
 */
class NotFoundError extends InventoryError {
  constructor(resource, identifier) {
    super(`${resource} not found: ${identifier}`, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
    this.resource = resource;
    this.identifier = identifier;
  }
}

/**
 * Insufficient quantity error
 */
class InsufficientQuantityError extends InventoryError {
  constructor(sku, requested, available) {
    super(
      `Insufficient quantity for ${sku}. Requested: ${requested}, Available: ${available}`,
      'INSUFFICIENT_QUANTITY',
      422
    );
    this.name = 'InsufficientQuantityError';
    this.sku = sku;
    this.requested = requested;
    this.available = available;
  }
}

/**
 * Idempotency error
 */
class IdempotencyError extends InventoryError {
  constructor(message, idempotencyKey) {
    super(message, 'IDEMPOTENCY_ERROR', 409);
    this.name = 'IdempotencyError';
    this.idempotencyKey = idempotencyKey;
  }
}

/**
 * Persistence error
 */
class PersistenceError extends InventoryError {
  constructor(message, operation, filename) {
    super(message, 'PERSISTENCE_ERROR', 500);
    this.name = 'PersistenceError';
    this.operation = operation;
    this.filename = filename;
  }
}

/**
 * Error handler utility
 */
class ErrorHandler {
  /**
   * Handle and format errors
   * @param {Error} error - Error to handle
   * @returns {Object} - Formatted error response
   */
  static handle(error) {
    if (error instanceof InventoryError) {
      return {
        error: {
          name: error.name,
          message: error.message,
          code: error.code,
          statusCode: error.statusCode,
          timestamp: error.timestamp,
          ...(error.sku && { sku: error.sku }),
          ...(error.field && { field: error.field }),
          ...(error.resource && { resource: error.resource }),
          ...(error.identifier && { identifier: error.identifier }),
          ...(error.requested && { requested: error.requested }),
          ...(error.available && { available: error.available }),
          ...(error.idempotencyKey && { idempotencyKey: error.idempotencyKey }),
          ...(error.operation && { operation: error.operation }),
          ...(error.filename && { filename: error.filename })
        }
      };
    }

    // Generic error handling
    return {
      error: {
        name: 'InternalServerError',
        message: error.message || 'Internal server error',
        code: 'INTERNAL_ERROR',
        statusCode: 500,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Create validation error
   * @param {string} message - Error message
   * @param {string} field - Field name
   * @returns {ValidationError}
   */
  static validation(message, field = null) {
    return new ValidationError(message, field);
  }

  /**
   * Create not found error
   * @param {string} resource - Resource type
   * @param {string} identifier - Resource identifier
   * @returns {NotFoundError}
   */
  static notFound(resource, identifier) {
    return new NotFoundError(resource, identifier);
  }

  /**
   * Create insufficient quantity error
   * @param {string} sku - SKU identifier
   * @param {number} requested - Requested quantity
   * @param {number} available - Available quantity
   * @returns {InsufficientQuantityError}
   */
  static insufficientQuantity(sku, requested, available) {
    return new InsufficientQuantityError(sku, requested, available);
  }

  /**
   * Create concurrency error
   * @param {string} sku - SKU identifier
   * @param {number} expectedVersion - Expected version
   * @param {number} currentVersion - Current version
   * @returns {ConcurrencyError}
   */
  static concurrency(sku, expectedVersion, currentVersion) {
    return new ConcurrencyError(
      `Version mismatch for SKU ${sku}. Expected: ${expectedVersion}, Current: ${currentVersion}`,
      sku,
      expectedVersion,
      currentVersion
    );
  }
}

module.exports = {
  InventoryError,
  ConcurrencyError,
  ValidationError,
  NotFoundError,
  InsufficientQuantityError,
  IdempotencyError,
  PersistenceError,
  ErrorHandler
};
