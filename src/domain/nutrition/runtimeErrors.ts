export type PlanRuntimeErrorCode =
  | 'SNAPSHOT_INVALID'
  | 'SNAPSHOT_MISSING'
  | 'SNAPSHOT_FREEZE_FAILED'
  | 'LOAD_FAILED'
  | 'LOCK_FAILED'
  | 'NETWORK_FAILURE'
  | 'UNKNOWN_RUNTIME_FAILURE';

export class PlanRuntimeError extends Error {
  readonly code: PlanRuntimeErrorCode;
  readonly retryable: boolean;
  readonly source?: string;
  readonly details?: string[];

  constructor(params: {
    code: PlanRuntimeErrorCode;
    message: string;
    retryable: boolean;
    source?: string;
    details?: string[];
    cause?: unknown;
  }) {
    super(params.message);
    this.name = 'PlanRuntimeError';
    this.code = params.code;
    this.retryable = params.retryable;
    this.source = params.source;
    this.details = params.details;

    if (params.cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        value: params.cause,
        enumerable: false,
        configurable: true,
        writable: true,
      });
    }
  }
}

export const createSnapshotValidationError = (source: string, errors: string[]): PlanRuntimeError =>
  new PlanRuntimeError({
    code: 'SNAPSHOT_INVALID',
    retryable: true,
    source,
    details: errors,
    message: `Snapshot validation failed (${source}): ${errors.join('; ')}`,
  });

export const createSnapshotInvariantError = (): PlanRuntimeError =>
  new PlanRuntimeError({
    code: 'SNAPSHOT_MISSING',
    retryable: true,
    message: 'Locked plan is missing immutable snapshot.',
  });

export const createTransientLoadError = (message: string, cause?: unknown): PlanRuntimeError =>
  new PlanRuntimeError({
    code: 'LOAD_FAILED',
    retryable: true,
    message,
    cause,
  });

export const createLockFailureError = (message: string, cause?: unknown): PlanRuntimeError =>
  new PlanRuntimeError({
    code: 'LOCK_FAILED',
    retryable: true,
    message,
    cause,
  });

export const normalizeRuntimeError = (
  error: unknown,
  fallbackMessage: string,
  fallbackCode: PlanRuntimeErrorCode = 'UNKNOWN_RUNTIME_FAILURE',
  retryable = false,
): PlanRuntimeError => {
  if (error instanceof PlanRuntimeError) return error;
  if (error instanceof Error) {
    return new PlanRuntimeError({
      code: fallbackCode,
      retryable,
      message: error.message || fallbackMessage,
      cause: error,
    });
  }

  return new PlanRuntimeError({
    code: fallbackCode,
    retryable,
    message: fallbackMessage,
    cause: error,
  });
};

export const classifyLoadRuntimeError = (error: unknown, fallbackMessage = 'Failed to load plan'): PlanRuntimeError => {
  if (error instanceof PlanRuntimeError) return error;
  if (error instanceof Error) {
    return new PlanRuntimeError({
      code: 'LOAD_FAILED',
      retryable: true,
      message: error.message || fallbackMessage,
      cause: error,
    });
  }

  return new PlanRuntimeError({
    code: 'UNKNOWN_RUNTIME_FAILURE',
    retryable: false,
    message: fallbackMessage,
    cause: error,
  });
};
