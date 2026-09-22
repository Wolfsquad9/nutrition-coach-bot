/**
 * ReviewQueue — UI tests (Phase 13E)
 *
 * Verifies the read-only coach queue: loading / empty / error states, entries
 * for outstanding and recorded decisions, insufficient-data clients, the
 * deterministic two-section ordering, navigation into the EXISTING client
 * Review workflow, and the absence of any write/plan/bulk controls.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ReviewQueue } from './ReviewQueue';
import type {
  ReviewQueueItem,
  ReviewQueue as ReviewQueueModel,
} from '@/services/review/reviewQueueService';
import type { ReviewQueueState } from '@/hooks/useReviewQueue';

function item(overrides: Partial<ReviewQueueItem> & { clientId: string }): ReviewQueueItem {
  return {
    clientId: overrides.clientId,
    clientName: `Client ${overrides.clientId}`,
    reviewStatus: 'adjustment_recommended',
    decisionStatus: 'needed',
    decisionAction: null,
    reviewDate: '2026-09-15',
    ...overrides,
  };
}

const QUEUE: ReviewQueueModel = {
  needsDecision: [
    item({ clientId: 'c-1', clientName: 'Client A', reviewStatus: 'adjustment_recommended' }),
    item({ clientId: 'c-2', clientName: 'Client B', reviewStatus: 'insufficient_data' }),
  ],
  resolved: [
    item({
      clientId: 'c-3',
      clientName: 'Client C',
      reviewStatus: 'maintain',
      decisionStatus: 'recorded',
      decisionAction: 'accepted',
    }),
  ],
};

const READY: ReviewQueueState = { status: 'ready', queue: QUEUE, error: null };

function renderQueue(state: ReviewQueueState) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<ReviewQueue state={state} />} />
        {/* The EXISTING per-client review route (a stub marker here). */}
        <Route path="/clients/:clientId/review" element={<div>CLIENT REVIEW PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ReviewQueue — states', () => {
  it('renders the loading state without fabricated entries', () => {
    renderQueue({ status: 'loading', queue: null, error: null });
    expect(screen.getByLabelText('Loading review queue')).toBeInTheDocument();
    expect(screen.queryByText(/Client [A-C]/)).toBeNull();
  });

  it('renders the empty client roster state', () => {
    renderQueue({
      status: 'ready',
      queue: { needsDecision: [], resolved: [] },
      error: null,
    });
    expect(screen.getByText('No clients available for review.')).toBeInTheDocument();
  });

  it('renders the all-up-to-date state when every review is resolved', () => {
    renderQueue({
      status: 'ready',
      queue: {
        needsDecision: [],
        resolved: [item({ clientId: 'c-1', decisionStatus: 'recorded' })],
      },
      error: null,
    });
    expect(screen.getByText('All clients are up to date.')).toBeInTheDocument();
    expect(screen.getByText('Recently reviewed')).toBeInTheDocument();
  });

  it('renders the error state and no fabricated entries', () => {
    renderQueue({ status: 'error', queue: null, error: 'network down' });
    expect(screen.getByText(/Unable to load the review queue/)).toBeInTheDocument();
    expect(screen.getByText(/network down/)).toBeInTheDocument();
    expect(screen.queryByText('Needs decision')).toBeNull();
  });
});

describe('ReviewQueue — populated rendering', () => {
  it('renders needs-decision entries with review status and decision-needed wording', () => {
    renderQueue(READY);
    expect(screen.getByText('Needs decision')).toBeInTheDocument();
    expect(screen.getByText('Client A')).toBeInTheDocument();
    expect(screen.getByText('Adjustment recommended')).toBeInTheDocument();
    expect(screen.getByText('Insufficient data')).toBeInTheDocument();
    expect(screen.getAllByText('Decision needed').length).toBe(2);
    expect(screen.getAllByText('Last review: 2026-09-15').length).toBe(3);
  });

  it('renders resolved entries with the persisted coach action, never as a prescription change', () => {
    renderQueue(READY);
    expect(screen.getByText('Recently reviewed')).toBeInTheDocument();
    expect(screen.getByText('Client C')).toBeInTheDocument();
    // The persisted action label (existing Phase 13C presentation), not a
    // prescription-mutation claim.
    expect(screen.getByText(/Accept recommendation/)).toBeInTheDocument();
  });

  it('orders sections deterministically: needs decision before recently reviewed', () => {
    renderQueue(READY);
    const needs = screen.getByText('Needs decision');
    const recent = screen.getByText('Recently reviewed');
    expect(needs.compareDocumentPosition(recent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('navigates to the existing client Review workflow on entry activation', () => {
    renderQueue(READY);
    fireEvent.click(screen.getByRole('button', { name: /Review Client A/ }));
    expect(screen.getByText('CLIENT REVIEW PAGE')).toBeInTheDocument();
  });

  it('provides no write, plan or bulk controls (navigation only)', () => {
    renderQueue(READY);
    const buttons = screen.getAllByRole('button');
    // Every interactive element is a navigation entry into the review workflow.
    for (const button of buttons) {
      expect(button.getAttribute('aria-label')).toMatch(/^Review /);
      expect(button.textContent).not.toMatch(/delete|remove|generate|lock|unlock|activate/i);
    }
  });
});
