import type { PlanRuntimeErrorCode } from './runtimeErrors';

export type RuntimeTelemetryEventName =
  | 'snapshot_validation_failed'
  | 'snapshot_invariant_failed'
  | 'snapshot_hydration_reset'
  | 'retry_attempted'
  | 'retry_succeeded'
  | 'retry_failed'
  | 'lock_failed'
  | 'load_failed';

export interface RuntimeTelemetryEvent {
  name: RuntimeTelemetryEventName;
  timestamp: string;
  code?: PlanRuntimeErrorCode;
  retryable?: boolean;
  source?: string;
  clientId?: string;
  planId?: string | null;
  versionId?: string | null;
  details?: string[];
  metadata?: Record<string, unknown>;
}

type TelemetrySink = (event: RuntimeTelemetryEvent) => void;

let telemetrySink: TelemetrySink = (event) => {
  console.info('[nutrition-runtime-telemetry]', event);
};

export const setRuntimeTelemetrySink = (sink: TelemetrySink) => {
  telemetrySink = sink;
};

export const emitRuntimeTelemetry = (event: Omit<RuntimeTelemetryEvent, 'timestamp'>): void => {
  try {
    telemetrySink({ ...event, timestamp: new Date().toISOString() });
  } catch {
    // swallow telemetry failures to avoid impacting runtime correctness
  }
};

export const emitRuntimeFailure = (params: {
  code: PlanRuntimeErrorCode;
  retryable: boolean;
  source: string;
  clientId?: string;
  planId?: string | null;
  versionId?: string | null;
  details?: string[];
  metadata?: Record<string, unknown>;
}) => {
  const name: RuntimeTelemetryEventName = params.code === 'LOCK_FAILED'
    ? 'lock_failed'
    : params.code === 'SNAPSHOT_INVALID'
      ? 'snapshot_validation_failed'
      : params.code === 'SNAPSHOT_MISSING'
        ? 'snapshot_invariant_failed'
        : 'load_failed';

  emitRuntimeTelemetry({
    name,
    code: params.code,
    retryable: params.retryable,
    source: params.source,
    clientId: params.clientId,
    planId: params.planId,
    versionId: params.versionId,
    details: params.details,
    metadata: params.metadata,
  });
};

export const emitRetryTelemetry = (params: {
  phase: 'attempted' | 'succeeded' | 'failed';
  source: string;
  clientId?: string;
  planId?: string | null;
  versionId?: string | null;
  code?: PlanRuntimeErrorCode;
  retryable?: boolean;
}) => {
  emitRuntimeTelemetry({
    name: params.phase === 'attempted' ? 'retry_attempted' : params.phase === 'succeeded' ? 'retry_succeeded' : 'retry_failed',
    source: params.source,
    clientId: params.clientId,
    planId: params.planId,
    versionId: params.versionId,
    code: params.code,
    retryable: params.retryable,
  });
};

export const emitHydrationResetTelemetry = (params: {
  source: string;
  clientId?: string;
  planId?: string | null;
  versionId?: string | null;
  code?: PlanRuntimeErrorCode;
}) => {
  emitRuntimeTelemetry({
    name: 'snapshot_hydration_reset',
    source: params.source,
    clientId: params.clientId,
    planId: params.planId,
    versionId: params.versionId,
    code: params.code,
    metadata: { failClosed: true },
  });
};
