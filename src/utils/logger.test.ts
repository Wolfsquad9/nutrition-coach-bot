import { describe, it, expect, beforeEach } from 'vitest';
import { logEvent, getRecentEvents, clearEvents, logger } from './logger';

describe('logger', () => {
  beforeEach(() => clearEvents());

  it('appends events to the ring buffer', () => {
    logEvent({ level: 'info', message: 'hello', source: 'test' });
    const events = getRecentEvents();
    expect(events).toHaveLength(1);
    expect(events[0].message).toBe('hello');
    expect(events[0].level).toBe('info');
    expect(events[0].source).toBe('test');
    expect(events[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns events newest first', () => {
    logEvent({ level: 'info', message: 'first' });
    logEvent({ level: 'info', message: 'second' });
    const events = getRecentEvents();
    expect(events.map((e) => e.message)).toEqual(['second', 'first']);
  });

  it('caps the ring buffer at 100 entries', () => {
    for (let i = 0; i < 150; i++) {
      logEvent({ level: 'debug', message: `msg-${i}` });
    }
    const events = getRecentEvents(200);
    expect(events).toHaveLength(100);
    // oldest should be msg-50 (we dropped 0-49)
    expect(events[events.length - 1].message).toBe('msg-50');
    // newest should be msg-149
    expect(events[0].message).toBe('msg-149');
  });

  it('respects the limit argument in getRecentEvents', () => {
    for (let i = 0; i < 10; i++) logEvent({ level: 'info', message: `m${i}` });
    expect(getRecentEvents(3)).toHaveLength(3);
  });

  it('logger helpers attach correct level', () => {
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    const levels = getRecentEvents(10).map((e) => e.level);
    expect(levels).toEqual(['error', 'warn', 'info', 'debug']);
  });

  it('clearEvents empties the buffer', () => {
    logEvent({ level: 'info', message: 'x' });
    clearEvents();
    expect(getRecentEvents()).toHaveLength(0);
  });

  it('never throws, even with circular context', () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    expect(() => logEvent({ level: 'error', message: 'boom', context: circular })).not.toThrow();
  });
});
