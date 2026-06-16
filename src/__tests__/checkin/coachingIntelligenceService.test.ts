/**
 * Unit tests for coachingIntelligenceService
 */
import { describe, it, expect } from 'vitest';
import { getAdherenceTrend, getProgressTrajectory, generateWeeklySummary } from '@/services/checkin/coachingIntelligenceService';

describe('coachingIntelligenceService', () => {
  describe('getAdherenceTrend', () => {
    it('returns mock trend data with correct period', async () => {
      const result = await getAdherenceTrend('c1', '7d');
      expect(result.trend).toBeDefined();
      expect(result.trend?.period).toBe('7d');
      expect(result.trend?.data_points).toHaveLength(7);
      expect(result.trend?.average_adherence).toBeGreaterThanOrEqual(0);
      expect(['improving', 'stable', 'declining']).toContain(result.trend?.trend_direction);
    });

    it('returns 30 data points for 30d period', async () => {
      const result = await getAdherenceTrend('c1', '30d');
      expect(result.trend?.data_points).toHaveLength(30);
    });

    it('returns 90 data points for 90d period', async () => {
      const result = await getAdherenceTrend('c1', '90d');
      expect(result.trend?.data_points).toHaveLength(90);
    });
  });

  describe('getProgressTrajectory', () => {
    it('returns mock trajectory data', async () => {
      const result = await getProgressTrajectory('c1');
      expect(result.trajectory).toBeDefined();
      expect(result.trajectory?.client_id).toBe('c1');
      expect(result.trajectory?.weight_change_kg).toBe(-1.2);
      expect(result.trajectory?.adherence_trend).toHaveLength(6);
      expect(['improving', 'stable', 'declining', 'insufficient_data']).toContain(result.trajectory?.trajectory);
    });
  });

  describe('generateWeeklySummary', () => {
    it('returns mock coaching summary', async () => {
      const result = await generateWeeklySummary('c1', '2026-06-08');
      expect(result.summary).toBeDefined();
      expect(result.summary?.client_id).toBe('c1');
      expect(result.summary?.highlights).toHaveLength(3);
      expect(result.summary?.recommendations).toHaveLength(2);
      expect(result.summary?.risk_flags).toHaveLength(1);
      expect(result.summary?.trajectory).toBe('improving');
    });
  });
});