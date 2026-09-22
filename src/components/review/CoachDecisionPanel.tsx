/**
 * CoachDecisionPanel — record what the coach decided (Phase 13C).
 *
 * Extends the Phase 13B review presentation with a decision-recording panel.
 * It NEVER generates, locks or mutates a nutrition plan: the only persisted
 * object is an audit record of the coaching decision. The system recommendation
 * is always shown verbatim and stored as a snapshot; the coach's chosen final
 * target (if any) is stored separately.
 *
 * Actions exposed per review status:
 *  - adjustment_recommended -> Accept recommendation / Modify / Keep current / Defer
 *  - maintain               -> Confirm maintain / Defer
 *  - review_required / insufficient_data -> Defer only (no invented adjustment)
 */

import { useState } from 'react';
import { PenLine, Shield, Check, Pencil, Minus, Clock, Loader2, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  presentCoachAction,
  CONFIRM_MAINTAIN_LABEL,
} from './coachDecisionPresentation';
import { formatKcal, formatInteger } from './reviewPresentation';
import {
  ALLOWED_ACTIONS_BY_STATUS,
  validateCoachingDecisionInput,
  type CoachAction,
  type CoachingDecisionInput,
} from '@/domain/coaching/coachingDecision';
import { todayIso } from '@/hooks/useCoachingDecision';
import type { ClientReview } from '@/domain/review/reviewModel';
import type { Client } from '@/types';
import type { ReviewPrescriptionInfo } from './reviewView';
import type { CoachingDecision } from '@/domain/coaching/coachingDecision';
import type { CreateCoachingDecisionInput } from '@/services/review/coachingDecisionService';

export interface CoachingDecisionRecordProps {
  readonly isSaving: boolean;
  readonly error: string | null;
  readonly recorded: CoachingDecision | null;
  /**
   * Phase 13F: the decision PERSISTED for the current decision date (hydrated
   * from the database on mount/refresh). Source of truth for the recorded
   * state when no in-session recording exists.
   */
  readonly persistedRecorded?: CoachingDecision | null;
}

export interface CoachDecisionPanelProps {
  readonly client: Client;
  readonly review: ClientReview;
  readonly prescription: ReviewPrescriptionInfo | null;
  readonly recording: CoachingDecisionRecordProps;
  readonly onRecord: (input: CreateCoachingDecisionInput) => void;
  /**
   * Phase 13F: the decision PERSISTED for the current decision date, if the
   * persistence layer reports one (hard-refresh / navigation hydration). The
   * fresh in-hook recording always wins; persistence is the fallback source
   * of truth. Historical decisions are never passed here.
   */
  readonly persistedRecorded?: CoachingDecision | null;
  /** Phase 13F: true while the persisted current decision is being checked. */
  readonly isCheckingRecorded?: boolean;
}

export function CoachDecisionPanel({
  client,
  review,
  prescription,
  recording,
  onRecord,
  persistedRecorded,
  isCheckingRecorded,
}: CoachDecisionPanelProps) {
  const [mode, setMode] = useState<'idle' | 'modify'>('idle');
  const [targetInput, setTargetInput] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [localError, setLocalError] = useState<string | null>(null);
  const allowed = ALLOWED_ACTIONS_BY_STATUS[review.status];

  // Only a SUCCESSFULLY persisted decision (this session) or a decision
  // hydrated from persistence puts the panel in its recorded state. A failed
  // save leaves `recording.recorded` null, so the panel stays actionable.
  const recordedDecision = recording.recorded ?? persistedRecorded ?? null;
  if (recordedDecision) {
    return <RecordedState recorded={recordedDecision} review={review} />;
  }

  const submit = (action: CoachAction, finalTargetCalories: number | null) => {
    const input = buildInput({
      client,
      review,
      prescription,
      action,
      finalTargetCalories,
      note,
    });
    const validation = validateCoachingDecisionInput(input, { weightKg: client.weight });
    if (!validation.valid) {
      setLocalError(validation.errors.join(' '));
      return;
    }
    setLocalError(null);
    onRecord({ ...input, clientWeightKg: client.weight });
  };

  const beginModify = () => {
    setTargetInput(
      review.proposedTargetCalories !== null ? String(review.proposedTargetCalories) : '',
    );
    setMode('modify');
    setLocalError(null);
  };

  const submitModified = () => {
    const parsed = Number(targetInput);
    submit('modified', Number.isFinite(parsed) ? parsed : null);
  };

  const showModify = mode === 'modify';
  const isAdjustment =
    review.status === 'adjustment_recommended' && review.proposedTargetCalories !== null;
  const isMaintain = review.status === 'maintain';
  const isReviewState = review.status === 'review_required' || review.status === 'insufficient_data';
  // Controls are disabled while a save is in flight AND while the persisted
  // current decision is being hydrated — this prevents any duplicate
  // submission from either rapid interaction or a racing hydration.
  const controlsDisabled = recording.isSaving || isCheckingRecorded === true;

  return (
    <Card className="p-5 shadow-card border-primary/30">
      <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
        <PenLine className="h-5 w-5 text-muted-foreground" />
        Coach Decision
      </h3>

      {isAdjustment ? (
        <div className="mt-2 text-sm">
          <p className="font-medium text-foreground flex items-center gap-2">
            <Shield className="h-4 w-4" />
            System recommendation
          </p>
          <p className="text-muted-foreground">
            {formatInteger(review.adaptationDecision.calorieAdjustmentKcal)} kcal/day · Proposed
            target: {formatKcal(review.proposedTargetCalories!)}
          </p>
        </div>
      ) : isMaintain ? (
        <p className="mt-2 text-sm text-muted-foreground">
          System recommends maintaining the current target of{' '}
          {formatKcal(review.currentTargetCalories)}.
        </p>
      ) : isReviewState ? (
        <p className="mt-2 text-sm text-muted-foreground">
          This review does not carry an adjustment recommendation. You can record a deferral so
          this state is acknowledged, but no nutrition change is proposed.
        </p>
      ) : null}

      <div className="mt-3">
        <p className="text-sm font-medium text-foreground">What did you decide?</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {allowed.includes('accepted') ? (
            <Button
              variant="default"
              disabled={controlsDisabled}
              onClick={() => submit('accepted', review.proposedTargetCalories)}
              className="gap-2"
            >
              <Check className="h-4 w-4" />
              {presentCoachAction('accepted').label}
            </Button>
          ) : null}

          {allowed.includes('modified') ? (
            <Button
              variant="outline"
              disabled={controlsDisabled}
              onClick={beginModify}
              className="gap-2"
            >
              <Pencil className="h-4 w-4" />
              {presentCoachAction('modified').label}
            </Button>
          ) : null}

          {allowed.includes('maintained') ? (
            <Button
              variant="outline"
              disabled={controlsDisabled}
              onClick={() => submit('maintained', null)}
              className="gap-2"
            >
              <Minus className="h-4 w-4" />
              {isMaintain ? CONFIRM_MAINTAIN_LABEL : presentCoachAction('maintained').label}
            </Button>
          ) : null}

          {allowed.includes('deferred') ? (
            <Button
              variant="outline"
              disabled={controlsDisabled}
              onClick={() => submit('deferred', null)}
              className="gap-2"
            >
              <Clock className="h-4 w-4" />
              {presentCoachAction('deferred').label}
            </Button>
          ) : null}
        </div>
      </div>

      {showModify ? (
        <div className="mt-4">
          <div className="flex items-end gap-2">
            <div>
              <Label htmlFor="coach-target" className="text-sm">
                Your target (kcal/day)
              </Label>
              <Input
                id="coach-target"
                type="number"
                min={1}
                step={1}
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
                className="mt-1 w-40"
                disabled={controlsDisabled}
              />
            </div>
            <Button
              variant="default"
              disabled={controlsDisabled}
              onClick={submitModified}
              className="mt-4 gap-2"
            >
              {controlsDisabled ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Save modified decision
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMode('idle')}
              disabled={controlsDisabled}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-4">
        <Label htmlFor="coach-decision-note" className="text-sm">
          Coach note <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="coach-decision-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="mt-1"
          disabled={controlsDisabled}
          placeholder="e.g. Client has travel next week; using a smaller reduction."
        />
      </div>

      {recording.isSaving ? (
        <p className="mt-3 text-sm text-muted-foreground flex items-center gap-2" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin" /> Recording decision…
        </p>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Recording this decision does not change the prescription and does not generate or lock a
          new plan.
        </p>
      )}

      {localError || recording.error ? (
        <Alert variant="destructive" className="mt-3">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-destructive">
            <strong>Decision not recorded.</strong>{' '}
            {localError ?? recording.error} You can retry below.
          </AlertDescription>
        </Alert>
      ) : null}
    </Card>
  );
}

// ============================================================================
// Helpers
// ============================================================================

interface BuildInputArgs {
  client: Client;
  review: ClientReview;
  prescription: ReviewPrescriptionInfo | null;
  action: CoachAction;
  finalTargetCalories: number | null;
  note: string;
}

/** Build the complete, self-contained decision snapshot for one action. */
export function buildDecisionInput(args: BuildInputArgs): CoachingDecisionInput {
  const { client, review, prescription, action, finalTargetCalories, note } = args;
  return {
    clientId: client.id,
    recommendationStatus: review.status,
    coachAction: action,
    baselinePrescriptionVersionId: prescription?.versionId ?? null,
    observedWeeklyRateKg: review.observedWeeklyRateKg,
    targetWeeklyRateKg: review.targetWeeklyRateKg,
    adherenceScore: review.adherenceScore,
    recommendedCalorieAdjustment: review.adaptationDecision.calorieAdjustmentKcal,
    recommendedTargetCalories: review.proposedTargetCalories,
    finalTargetCalories,
    coachNote: note && note.trim() ? note.trim() : null,
    decisionDate: todayIso(new Date()),
  };
}

function buildInput(args: BuildInputArgs): CreateCoachingDecisionInput {
  const input = buildDecisionInput(args);
  return { ...input, clientWeightKg: args.client.weight };
}

function RecordedState({ recorded, review }: { recorded: CoachingDecision; review: ClientReview }) {
  const isAdjustment = review.status === 'adjustment_recommended';
  return (
    <Card className="p-5 shadow-card border-success/30">
      <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
        <Check className="h-5 w-5 text-success" />
        Decision recorded
      </h3>
      <div className="mt-2 text-sm space-y-1">
        {isAdjustment ? (
          <p className="text-muted-foreground">
            System recommendation: {formatInteger(recorded.recommendedCalorieAdjustment ?? 0)}{' '}
            kcal/day
          </p>
        ) : null}
        <p className="text-muted-foreground">
          Coach decision: {presentCoachAction(recorded.coachAction).label}
        </p>
        {recorded.finalTargetCalories !== null ? (
          <p className="text-muted-foreground">
            Final target: {formatKcal(recorded.finalTargetCalories)}
          </p>
        ) : null}
        {recorded.coachNote ? (
          <p className="text-muted-foreground italic">“{recorded.coachNote}”</p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Recorded on {recorded.decisionDate}. No prescription was updated and no new plan was
          activated.
        </p>
      </div>
    </Card>
  );
}