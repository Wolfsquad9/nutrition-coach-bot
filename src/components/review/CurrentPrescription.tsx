/**
 * CurrentPrescription — read-only current prescription panel.
 *
 * Displays the client's ACTIVE prescription (calories / macros / weekly rate /
 * lock state) from the existing canonical source. When there is no active
 * (locked) prescription, it shows an explicit empty state — it never presents
 * derived target values as if they were the client's prescription.
 */

import {
  Clipboard,
  Flame,
  Drumstick,
  Wheat,
  Droplet,
  TrendingDown,
  Lock,
  Database,
  CloudOff,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MetricRow } from './MetricRow';
import { formatKcal, formatGrams, formatRate } from './reviewPresentation';
import type { NutritionMetrics } from '@/types';
import type { ReviewPrescriptionInfo } from './reviewView';

const STATE_PRESENTATION: Record<string, { label: string; className: string }> = {
  LOCKED: { label: 'Locked', className: 'bg-success/20 text-success border-success/30' },
  DRAFT: { label: 'Draft', className: 'bg-warning/20 text-warning border-warning/30' },
  EMPTY: { label: 'No plan', className: 'bg-muted text-muted-foreground border-border' },
  EXPIRED: { label: 'Lock expired', className: 'bg-success/20 text-success border-success/30' },
  ERROR: { label: 'Plan error', className: 'bg-destructive/20 text-destructive border-destructive/30' },
  LOADING: { label: 'Loading…', className: 'text-muted-foreground animate-pulse' },
  SAVING: { label: 'Locking…', className: 'text-primary animate-pulse' },
};

export interface CurrentPrescriptionProps {
  metrics: NutritionMetrics | null;
  prescription: ReviewPrescriptionInfo | null;
}

export function CurrentPrescription({ metrics, prescription }: CurrentPrescriptionProps) {
  const noActivePrescription = !prescription?.hasActivePrescription;

  return (
    <Card className="p-5 shadow-card">
      <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
        <Clipboard className="h-5 w-5 text-muted-foreground" />
        Current Prescription
      </h3>

      {noActivePrescription ? (
        <Alert className="mb-3 border-warning/50 bg-warning/10">
          <CloudOff className="h-4 w-4 text-warning" />
          <AlertDescription className="text-warning">
            No active prescription. This client does not yet have a locked
            nutrition prescription — values are not shown rather than guessed.
          </AlertDescription>
        </Alert>
      ) : null}

      {prescription?.state ? (
        <div className="flex flex-wrap gap-2 mt-1">
          <StateBadge state={prescription.state} />
          {prescription.isLocked && prescription.daysRemaining !== null ? (
            <Badge variant="outline" className="bg-info/20 text-info border-info/30">
              {prescription.daysRemaining} day(s) remaining
            </Badge>
          ) : null}
        </div>
      ) : null}

      {metrics && !noActivePrescription ? (
        <div className="mt-3">
          <MetricRow
            label="Daily calories"
            value={formatKcal(metrics.targetCalories)}
            icon={<Flame className="h-4 w-4" />}
          />
          <MetricRow
            label="Protein"
            value={formatGrams(metrics.proteinGrams)}
            icon={<Drumstick className="h-4 w-4" />}
          />
          <MetricRow
            label="Carbohydrates"
            value={formatGrams(metrics.carbsGrams)}
            icon={<Wheat className="h-4 w-4" />}
          />
          <MetricRow
            label="Fat"
            value={formatGrams(metrics.fatGrams)}
            icon={<Droplet className="h-4 w-4" />}
          />
          {prescription?.weeklyRateKg !== null && prescription?.weeklyRateKg !== undefined ? (
            <MetricRow
              label="Target weekly rate"
              value={formatRate(prescription.weeklyRateKg)}
              icon={<TrendingDown className="h-4 w-4" />}
            />
          ) : null}
          {prescription?.versionNumber !== null && prescription?.versionNumber !== undefined ? (
            <MetricRow label="Prescription source" value={`Locked plan v${prescription.versionNumber}`} icon={<Lock className="h-4 w-4" />} />
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function StateBadge({ state }: { state: string }) {
  const presentation = STATE_PRESENTATION[state];
  if (!presentation) {
    return <Badge variant="outline">{state}</Badge>;
  }
  const icon = state === 'LOCKED' ? <Lock className="w-3 h-3 mr-1" /> : <Database className="w-3 h-3 mr-1" />;
  return <Badge variant="outline" className={presentation.className}>{icon}{presentation.label}</Badge>;
}