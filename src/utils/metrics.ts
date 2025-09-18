// Lightweight metrics collection system
interface Metrics {
  requests: number;
  errors: number;
  conflicts: number;
  idempotentHits: number;
  adjustStock: number;
  reserveStock: number;
  getInventory: number;
  syncOperations: number;
}

class MetricsCollector {
  private metrics: Metrics = {
    requests: 0,
    errors: 0,
    conflicts: 0,
    idempotentHits: 0,
    adjustStock: 0,
    reserveStock: 0,
    getInventory: 0,
    syncOperations: 0,
  };

  // Increment a specific metric
  increment(metric: keyof Metrics, count: number = 1): void {
    this.metrics[metric] += count;
  }

  // Get current metrics
  getMetrics(): Metrics {
    return { ...this.metrics };
  }

  // Reset all metrics (for testing)
  reset(): void {
    this.metrics = {
      requests: 0,
      errors: 0,
      conflicts: 0,
      idempotentHits: 0,
      adjustStock: 0,
      reserveStock: 0,
      getInventory: 0,
      syncOperations: 0,
    };
  }

  // Get metrics as JSON string
  toJSON(): string {
    return JSON.stringify(this.metrics, null, 2);
  }
}

// Global metrics instance
export const metrics = new MetricsCollector();

// Helper functions for common metric increments
export const incrementRequests = () => metrics.increment('requests');
export const incrementErrors = () => metrics.increment('errors');
export const incrementConflicts = () => metrics.increment('conflicts');
export const incrementIdempotentHits = () => metrics.increment('idempotentHits');
export const incrementAdjustStock = () => metrics.increment('adjustStock');
export const incrementReserveStock = () => metrics.increment('reserveStock');
export const incrementGetInventory = () => metrics.increment('getInventory');
export const incrementSyncOperations = () => metrics.increment('syncOperations');
