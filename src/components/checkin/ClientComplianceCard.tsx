/**
 * ClientComplianceCard — per-client summary card for coach dashboard.
 * Shows compliance score, streak, risk dot, and trend arrow.
 */
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Flame, TrendingDown, TrendingUp, Minus, AlertTriangle } from 'lucide-react';

interface Props {
  clientId: string;
  clientName: string;
  complianceScore: number; // 0–100
  currentStreak: number;
  longestStreak: number;
  lastCheckinDate: string | null;
  adherenceTrend: 'improving' | 'stable' | 'declining';
  onClick?: () => void;
}

export default function ClientComplianceCard({
  clientName,
  complianceScore,
  currentStreak,
  longestStreak,
  lastCheckinDate,
  adherenceTrend,
  onClick,
}: Props) {
  const riskLevel: 'red' | 'yellow' | 'green' =
    complianceScore < 50 ? 'red' : complianceScore < 70 ? 'yellow' : 'green';

  const daysSinceLastCheckin = lastCheckinDate
    ? Math.floor((Date.now() - new Date(lastCheckinDate).getTime()) / 86400000)
    : null;

  const isAtRisk = daysSinceLastCheckin !== null && daysSinceLastCheckin > 2;

  return (
    <Card
      className={`p-4 shadow-card cursor-pointer hover:shadow-lg transition-all ${
        riskLevel === 'red' ? 'border-red-300' : riskLevel === 'yellow' ? 'border-amber-300' : 'border-green-300'
      }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-bold text-sm truncate">{clientName}</p>
            {isAtRisk && (
              <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
            )}
          </div>

          <div className="flex items-center gap-2 mt-2">
            <span className={`text-2xl font-bold ${
              complianceScore >= 70 ? 'text-green-600' : complianceScore >= 50 ? 'text-amber-600' : 'text-red-600'
            }`}>
              {complianceScore}%
            </span>
            {adherenceTrend === 'improving' && <TrendingUp className="h-4 w-4 text-green-500" />}
            {adherenceTrend === 'declining' && <TrendingDown className="h-4 w-4 text-red-500" />}
            {adherenceTrend === 'stable' && <Minus className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>

        {/* Risk dot */}
        <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
          riskLevel === 'red' ? 'bg-red-500' : riskLevel === 'yellow' ? 'bg-amber-500' : 'bg-green-500'
        }`} />
      </div>

      <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
        {currentStreak > 0 && (
          <div className="flex items-center gap-1">
            <Flame className="h-3 w-3 text-orange-500" />
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