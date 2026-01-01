/**
 * Visual indicator for data source (persisted vs mock)
 */

import { Database, CloudOff, Lock, Unlock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface DataSourceIndicatorProps {
  isPersisted: boolean;
  isLoading?: boolean;
  label?: string;
}

export function DataSourceIndicator({ isPersisted, isLoading, label }: DataSourceIndicatorProps) {
  if (isLoading) {
    return (
      <Badge variant="outline" className="text-muted-foreground animate-pulse">
        Loading...
      </Badge>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant={isPersisted ? 'default' : 'secondary'}
            className={isPersisted 
              ? 'bg-success/20 text-success border-success/30 hover:bg-success/30' 
              : 'bg-warning/20 text-warning border-warning/30 hover:bg-warning/30'
            }
          >
            {isPersisted ? (
              <>
                <Database className="w-3 h-3 mr-1" />
                {label || 'Persisted'}
              </>
            ) : (
              <>
                <CloudOff className="w-3 h-3 mr-1" />
                {label || 'Local Only'}
              </>
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          {isPersisted 
            ? 'Data is saved to Supabase and will persist across sessions'
            : 'Data is only stored locally. Save to persist.'
          }
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface PlanLockIndicatorProps {
  isLocked: boolean;
  daysRemaining: number;
  lockedUntil: Date | null;
}

export function PlanLockIndicator({ isLocked, daysRemaining, lockedUntil }: PlanLockIndicatorProps) {
  if (!isLocked) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="text-muted-foreground">
              <Unlock className="w-3 h-3 mr-1" />
              Editable
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            No active plan or plan lock has expired. You can generate a new plan.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const formattedDate = lockedUntil 
    ? lockedUntil.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
    : '';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="secondary" 
            className="bg-info/20 text-info border-info/30"
          >
            <Lock className="w-3 h-3 mr-1" />
            Locked ({daysRemaining}j)
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          Plan is locked until {formattedDate}. Use suggestions to request changes.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface EmptyStateProps {
  type: 'clients' | 'plans';
  onAction?: () => void;
  actionLabel?: string;
}

export function EmptyState({ type, onAction, actionLabel }: EmptyStateProps) {
  const config = {
    clients: {
      title: 'No clients yet',
      description: 'Create your first client to get started with personalized nutrition plans.',
      icon: '👤',
    },
    plans: {
      title: 'No plan generated',
      description: 'Generate a meal plan based on selected ingredients and client goals.',
      icon: '📋',
    },
  };

  const { title, description, icon } = config[type];

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <span className="text-4xl mb-4">{icon}</span>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-4">{description}</p>
      {onAction && actionLabel && (
        <button
          onClick={onAction}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
