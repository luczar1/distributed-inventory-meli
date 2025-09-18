import { z } from 'zod';

// Base types
export type SKU = string;
export type StoreId = string;
export type Version = number;
export type Quantity = number;

// Zod schemas for validation
export const SKUSchema = z.string().min(1).max(50);
export const StoreIdSchema = z.string().min(1).max(20);
export const VersionSchema = z.number().int().positive();
export const QuantitySchema = z.number().int().min(0);

// Inventory record type and schema
export interface InventoryRecord {
  sku: SKU;
  storeId: StoreId;
  qty: Quantity;
  version: Version;
  updatedAt: Date;
}

export const InventoryRecordSchema = z.object({
  sku: SKUSchema,
  storeId: StoreIdSchema,
  qty: QuantitySchema,
  version: VersionSchema,
  updatedAt: z.date(),
});

// Command payloads
export interface AdjustStock {
  sku: SKU;
  storeId: StoreId;
  delta: number; // Can be positive or negative
  expectedVersion?: Version;
}

export interface ReserveStock {
  sku: SKU;
  storeId: StoreId;
  quantity: Quantity;
  expectedVersion?: Version;
}

export const AdjustStockSchema = z.object({
  sku: SKUSchema,
  storeId: StoreIdSchema,
  delta: z.number().int(),
  expectedVersion: VersionSchema.optional(),
});

export const ReserveStockSchema = z.object({
  sku: SKUSchema,
  storeId: StoreIdSchema,
  quantity: QuantitySchema,
  expectedVersion: VersionSchema.optional(),
});

// API Request DTOs
export interface CreateInventoryRequest {
  sku: SKU;
  storeId: StoreId;
  initialQuantity: Quantity;
}

export interface UpdateInventoryRequest {
  sku: SKU;
  storeId: StoreId;
  delta: number;
  expectedVersion?: Version;
}

export interface ReserveInventoryRequest {
  sku: SKU;
  storeId: StoreId;
  quantity: Quantity;
  expectedVersion?: Version;
}

export interface ReleaseInventoryRequest {
  sku: SKU;
  storeId: StoreId;
  quantity: Quantity;
  expectedVersion?: Version;
}

export interface GetInventoryRequest {
  sku: SKU;
  storeId: StoreId;
}

// API Response DTOs
export interface InventoryResponse {
  success: boolean;
  data: InventoryRecord;
  message?: string;
}

export interface InventoryListResponse {
  success: boolean;
  data: InventoryRecord[];
  count: number;
}

export interface ErrorResponse {
  success: false;
  error: {
    name: string;
    message: string;
    code: string;
    statusCode: number;
    timestamp: string;
    details?: Record<string, unknown>;
  };
}

// Validation schemas for API requests
export const CreateInventoryRequestSchema = z.object({
  sku: SKUSchema,
  storeId: StoreIdSchema,
  initialQuantity: QuantitySchema,
});

export const UpdateInventoryRequestSchema = z.object({
  sku: SKUSchema,
  storeId: StoreIdSchema,
  delta: z.number().int(),
  expectedVersion: VersionSchema.optional(),
});

export const ReserveInventoryRequestSchema = z.object({
  sku: SKUSchema,
  storeId: StoreIdSchema,
  quantity: QuantitySchema,
  expectedVersion: VersionSchema.optional(),
});

export const ReleaseInventoryRequestSchema = z.object({
  sku: SKUSchema,
  storeId: StoreIdSchema,
  quantity: QuantitySchema,
  expectedVersion: VersionSchema.optional(),
});

export const GetInventoryRequestSchema = z.object({
  sku: SKUSchema,
  storeId: StoreIdSchema,
});

// Event types for event sourcing
export interface InventoryEvent {
  id: string;
  type: 'stock_adjusted' | 'stock_reserved' | 'stock_released';
  sku: SKU;
  storeId: StoreId;
  quantity: number;
  version: Version;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export const InventoryEventSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['stock_adjusted', 'stock_reserved', 'stock_released']),
  sku: SKUSchema,
  storeId: StoreIdSchema,
  quantity: z.number().int(),
  version: VersionSchema,
  timestamp: z.date(),
  metadata: z.record(z.unknown()).optional(),
});

// Utility types
export type ApiResponse<T> = T | ErrorResponse;

export type CommandResult = {
  success: boolean;
  record?: InventoryRecord;
  error?: string;
};

// Idempotency key type
export type IdempotencyKey = string;

export const IdempotencyKeySchema = z.string().uuid();
