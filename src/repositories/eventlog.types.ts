// Event structure
export interface Event {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  ts: number;
  sequence: number;
  retryCount?: number;
  lastFailureTs?: number;
  failureReason?: string;
}

// Dead letter event structure
export interface DeadLetterEvent {
  originalEvent: Event;
  dlqTs: number;
  finalFailureReason: string;
  totalRetries: number;
}

// Event log data structure
export interface EventLogData {
  events: Event[];
  lastId?: string;
  lastSequence?: number;
}
