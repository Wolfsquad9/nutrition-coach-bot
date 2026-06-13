/**
 * Check-in Engine Types
 *
 * Mirrors the checkin_engine database schema for daily check-ins,
 * weekly reviews, streak tracking, coach alerts, and AI summaries.
 */

// ============================================================================
// Daily Check-in
// ============================================================================

export interface DailyCheckin {
  id: string;
  client_id: string;
  checkin_date: string;
  meal_adherence: number;      // 0–100
  workout_completed: boolean;
  energy_level: number | null; // 1–10
  mood: number | null;         // 1–10
  sleep_hours: number | null;  // 0–24
  water_intake_liters: number | null;
  current_weight_kg: number | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface DailyCheckinInsert {
  client_id: string;
  checkin_date: string;
  meal_adherence: number;
  workout_completed?: boolean;
  energy_level?: number | null;
  mood?: number | null;
  sleep_hours?: number | null;
  water_intake_liters?: number | null;
  current_weight_kg?: number | null;
  notes?: string | null;
  created_by: string;
}

// ============================================================================
// Weekly Review
// ============================================================================

export interface WeeklyReview {
  id: string;
  client_id: string;
  week_start_date: string;
  bodyweight_kg: number | null;
  waist_cm: number | null;
  hip_cm: number | null;
  chest_cm: number | null;
  adherence_score: number | null;    // 0–100
  diet_satisfaction: number | null;  // 1–10
  workout_consistency: number | null; // 0–100
  challenges: string | null;
  wins: string | null;
  goals_for_next_week: string | null;
  coach_notes: string | null;
  photo_urls: string[] | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface WeeklyReviewInsert {
  client_id: string;
  week_start_date: string;
  bodyweight_kg?: number | null;
  waist_cm?: number | null;
  hip_cm?: number | null;
  chest_cm?: number | null;
  adherence_score?: number | null;
  diet_satisfaction?: number | null;
  workout_consistency?: number | null;
  challenges?: string | null;
  wins?: string | null;
  goals_for_next_week?: string | null;
  coach_notes?: string | null;
  photo_urls?: string[] | null;
  created_by: string;
}

// ============================================================================
// Check-in Streak
// ============================================================================

export interface CheckinStreak {
  id: string;
  client_id: string;
  current_streak: number;
  longest_streak: number;
  last_checkin_date: string | null;
  streak_start_date: string | null;
  streak_broken_date: string | null;
  updated_at: string;
}

// ============================================================================
// Coach Alert
// ============================================================================

export type AlertSeverity = 'green' | 'yellow' | 'red';

export type AlertType =
  | 'missed_checkin'
  | 'low_adherence'
  | 'weight_concern'
  | 'mood_drop'
  | 'streak_broken'
  | 'goal_milestone'
  | 'review_needed'
  | 'system';

export interface CoachAlert {
  id: string;
  client_id: string;
  trainer_id: string;
  alert_type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  read: boolean;
  dismissed: boolean;
  read_at: string | null;
  created_at: string;
}

// ============================================================================
// AI Coaching Summary
// ============================================================================

export type ProgressTrajectory = 'improving' | 'stable' | 'declining' | 'insufficient_data';

export type SummaryType = 'weekly' | 'monthly' | 'adhoc';

export interface AiSummary {
  id: string;
  client_id: string;
  week_start_date: string;
  summary_type: SummaryType;
  adherence_score: number | null;
  progress_trajectory: ProgressTrajectory | null;
  summary_text: string;
  highlights: string[] | null;
  recommendations: string[] | null;
  risk_flags: string[] | null;
  model_version: string | null;
  raw_llm_response: Record<string, unknown> | null;
  created_by: string;
  created_at: string;
}

// ============================================================================
// Derived / Domain Types
// ============================================================================

/** Branded type for compliance scores — use factory function to construct. */
export type ComplianceScore = number & { readonly __brand: 'ComplianceScore' };

export function toComplianceScore(value: number): ComplianceScore {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return clamped as ComplianceScore;
}

export interface AdherenceTrend {
  client_id: string;
  period: '7d' | '30d' | '90d';
  average_adherence: number;
  trend_direction: 'improving' | 'stable' | 'declining';
  data_points: { date: string; adherence: number }[];
}

export interface ProgressTrajectoryData {
  client_id: string;
  start_date: string;
  end_date: string;
  weight_change_kg: number | null;
  adherence_trend: number[];
  trajectory: ProgressTrajectory;
}

export interface CoachingSummary {
  client_id: string;
  week_start_date: string;
  adherence_score: ComplianceScore | null;
  trajectory: ProgressTrajectory;
  highlights: string[];
  recommendations: string[];
  risk_flags: string[];
  generated_at: string;
}

// ============================================================================
// Form Types (UI layer)
// ============================================================================

export interface CheckinFormData {
  meal_adherence: number;
  workout_completed: boolean;
  energy_level: number | null;
  mood: number | null;
  sleep_hours: number | null;
  water_intake_liters: number | null;
  current_weight_kg: number | null;
  notes: string;
}

export interface WeeklyReviewFormData {
  bodyweight_kg: number | null;
  waist_cm: number | null;
  hip_cm: number | null;
  chest_cm: number | null;
  adherence_score: number | null;
  diet_satisfaction: number | null;
  workout_consistency: number | null;
  challenges: string;
  wins: string;
  goals_for_next_week: string;
  photo_urls: string[];
}