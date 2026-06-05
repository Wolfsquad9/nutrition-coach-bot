import { describe, it, expect, vi } from 'vitest';
import { emitRuntimeTelemetry, setRuntimeTelemetrySink } from './runtimeTelemetry';

describe('runtimeTelemetry', () => {
  it('swallows sink failures safely', () => {
    setRuntimeTelemetrySink(() => {
      throw new Error('telemetry down');
    });

    expect(() => {
      emitRuntimeTelemetry({ name: 'load_failed', source: 'fetchCurrentPlan', code: 'LOAD_FAILED', retryable: true });
    }).not.toThrow();
  });

  it('emits through sink when healthy', () => {
    const sink = vi.fn();
    setRuntimeTelemetrySink(sink);

    emitRuntimeTelemetry({ name: 'retry_attempted', source: 'retryLastAction' });
    expect(sink).toHaveBeenCalledTimes(1);
  });
});
