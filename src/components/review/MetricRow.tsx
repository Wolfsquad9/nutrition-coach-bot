/**
 * MetricRow — a single label/value line in a review panel.
 */

import type { ReactNode } from 'react';

export interface MetricRowProps {
  label: string;
  value: string;
  icon?: ReactNode;
  valueClassName?: string;
}

export function MetricRow({ label, value, icon, valueClassName = 'text-foreground' }: MetricRowProps) {
  return (
    <div className="flex items-center justify-between gap-2 py-2 border-b border-border/40">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className={`text-sm font-medium ${valueClassName}`}>{value}</span>
    </div>
  );
}