/**
 * ClientComplianceCard — per-client summary card for coach dashboard.
 * Shows compliance score, streak, risk dot, and trend arrow.
 */
import { Card } from '@/components/ui/card';
import { Flame, TrendingDown, TrendingUp, Minus, AlertTriangle } from 'lucide-react';
import type {
  AdherenceSource,
  AdherenceTrendDirection,
} from '@/domain/coaching/adherenceMetrics';

/** Human-readable label for the real evidence source of a score. */
const SOURCE_LABEL: Record<AdherenceSource, string> = {
  daily_checkin: 'Daily check-ins',
  weekly_review: 'Weekly review',
  mixed: 'Daily + weekly',
  none: 'No evidence',
};

interface Props {
  clientId: string;
  clientName: string;
  /** Canonical 0–100 compliance score; null when there is no evidence yet. */
  complianceScore: number | null;
  /** Real source(s) the score was derived from. */
  complianceSource: AdherenceSource;
  /** Distinct check-in days in the window. */
  checkinDays: number;
  /** Expected days in the window. */
  expectedDays: number;
  currentStreak: number;
  longestStreak: number;
  lastCheckinDate: string | null;
  adherenceTrend: AdherenceTrendDirection;
  onClick?: () => void;
}

const TREND_LABEL: Record<AdherenceTrendDirection, string> = {
  improving: 'Improving',
  stable: 'Stable',
  declining: 'Declining',
  insufficient_data: 'Not enough data',
};

export default function ClientComplianceCard({
  clientName,
  complianceScore,
  complianceSource,
  checkinDays,
  expectedDays,
  currentStreak,
  longestStreak,
  lastCheckinDate,
  adherenceTrend,
  onClick,
}: Props) {
  // A missing score is NOT 0% — it means "no evidence recorded yet".
  const hasScore = complianceScore !== null;
  const effectiveScore = complianceScore ?? 0;
  const riskLevel: 'red' | 'yellow' | 'green' = !hasScore
    ? 'red'
    : effectiveScore < 50
      ? 'red'
      : effectiveScore < 70
        ? 'yellow'
        : 'green';

  const daysSinceLastCheckin = lastCheckinDate
    ? Math.floor((Date.now() - new Date(lastCheckinDate).getTime()) / 86400000)
    : null;

  const isAtRisk = daysSinceLastCheckin !== null && daysSinceLastCheckin > 2;

  return (
    <Card
      className={`p-4 cursor-pointer transition-colors duration-150 ${
        riskLevel === 'red' ? 'border-danger/40 hover:border-danger' : riskLevel === 'yellow' ? 'border-warning/40 hover:border-warning' : 'border-primary/40 hover:border-primary'
      }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-display font-bold text-sm truncate">{clientName}</p>
            {isAtRisk && (
              <AlertTriangle className="h-4 w-4 text-danger flex-shrink-0" />
            )}
          </div>

          <div className="flex items-center gap-2 mt-2">
            <span className={`font-display text-2xl font-bold tabular-nums ${
              !hasScore
                ? 'text-muted-foreground'
                : effectiveScore >= 70
                  ? 'text-primary'
                  : effectiveScore >= 50
                    ? 'text-warning'
                    : 'text-danger'
            }`}>
              {hasScore ? `${effectiveScore}%` : '—'}
            </span>
            {adherenceTrend === 'improving' && <TrendingUp className="h-4 w-4 text-primary" />}
            {adherenceTrend === 'declining' && <TrendingDown className="h-4 w-4 text-danger" />}
            {adherenceTrend === 'stable' && <Minus className="h-4 w-4 text-muted-foreground" />}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {hasScore
              ? `${TREND_LABEL[adherenceTrend]} · ${checkinDays}/${expectedDays} days checked in`
              : 'No check-in data for the last 7 days'}
          </p>
          <p className="text-[11px] text-muted-foreground/80 mt-0.5">
            Source: {SOURCE_LABEL[complianceSource]}
          </p>
        </div>

        {/* Risk dot */}
        <div className={`w-2 h-2 rounded-sm flex-shrink-0 ${
          riskLevel === 'red' ? 'bg-danger' : riskLevel === 'yellow' ? 'bg-warning' : 'bg-primary'
        }`} />
      </div>

      <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
        {currentStreak > 0 && (
          <div className="flex items-center gap-1">
            <Flame className="h-3 w-3 text-warning" />
            <span>{currentStreak} day{currentStreak !== 1 ? 's' : ''}</span>
          </div>
        )}
        {longestStreak > 0 && (
          <span>Best: {longestStreak}</span>
        )}
        {lastCheckinDate && (
          <span>{daysSinceLastCheckin === 0 ? 'Today' : daysSinceLastCheckin === 1 ? 'Yesterday' : `${daysSinceLastCheckin}d ago`}</span>
        )}
      </div>
    </Card>
  );
}
