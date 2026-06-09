import { describe, it, expect } from 'vitest';
import { relativeTime } from './index';

describe('relativeTime', () => {
  const NOW = new Date('2026-06-10T12:00:00Z');

  it('returns "Just now" for under 1 minute', () => {
    const t = new Date(NOW.getTime() - 30_000).toISOString();
    expect(relativeTime(t, NOW)).toBe('Just now');
  });

  it('returns minutes for under 1 hour', () => {
    const t = new Date(NOW.getTime() - 15 * 60_000).toISOString();
    expect(relativeTime(t, NOW)).toBe('15 min ago');
  });

  it('returns hours for under 24 hours', () => {
    const t = new Date(NOW.getTime() - 3 * 60 * 60_000).toISOString();
    expect(relativeTime(t, NOW)).toBe('3h ago');
  });

  it('returns days for under 7 days', () => {
    const t = new Date(NOW.getTime() - 2 * 24 * 60 * 60_000).toISOString();
    expect(relativeTime(t, NOW)).toBe('2d ago');
  });

  it('returns locale date string for 7+ days', () => {
    const t = new Date(NOW.getTime() - 10 * 24 * 60 * 60_000).toISOString();
    expect(relativeTime(t, NOW)).toBe(new Date(t).toLocaleDateString());
  });

  it('returns empty string for invalid input', () => {
    expect(relativeTime('not-a-date', NOW)).toBe('');
  });
});
