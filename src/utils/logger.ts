/**
 * Lightweight client-side error + event logger.
 *
 * Currently writes to `console` and to a small in-memory ring buffer
 * (exposed via `getRecentEvents()` for future Sentry/PostHog wire-up).
 *
 * Design rules:
 *   1. Never throws — a logger that crashes is worse than no logger.
 *   2. PII-safe: do NOT log full client objects, emails, or tokens.
 *      Callers should pre-redact sensitive fields.
 *   3. Pure functions where possible (sanitize, ring buffer ops) so
 *      they're unit-testable without mocking the network.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEvent {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
  source?: string; // e.g. "ErrorBoundary", "planService"
}

const RING_SIZE = 100;
const ring: LogEvent[] = [];

/** Append an event to the in-memory ring buffer. Pure-data, never throws. */
export function logEvent(event: Omit<LogEvent, 'timestamp'>): void {
  try {
    const full: LogEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };
    ring.push(full);
    if (ring.length > RING_SIZE) ring.shift();

    // Mirror to console with a stable prefix so it's filterable.
    const prefix = `[${event.source ?? 'app'}]`;
    const args: unknown[] = [prefix, event.message];
    if (event.context) args.push(event.context);
    switch (event.level) {
      case 'debug': console.debug(...args); break;
      case 'info':  console.info(...args); break;
      case 'warn':  console.warn(...args); break;
      case 'error': console.error(...args); break;
    }
  } catch {
    // Last-ditch swallow. Logging must never crash the app.
  }
}

/** Returns the most recent events, newest first. */
export function getRecentEvents(limit = 50): readonly LogEvent[] {
  return ring.slice(-limit).reverse();
}

/** Clear the in-memory ring. Useful in tests and on logout. */
export function clearEvents(): void {
  ring.length = 0;
}

// Convenience helpers

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>, source?: string) =>
    logEvent({ level: 'debug', message: msg, context: ctx, source }),
  info: (msg: string, ctx?: Record<string, unknown>, source?: string) =>
    logEvent({ level: 'info', message: msg, context: ctx, source }),
  warn: (msg: string, ctx?: Record<string, unknown>, source?: string) =>
    logEvent({ level: 'warn', message: msg, context: ctx, source }),
  error: (msg: string, ctx?: Record<string, unknown>, source?: string) =>
    logEvent({ level: 'error', message: msg, context: ctx, source }),
};
