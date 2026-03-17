/**
 * LockPlanButton - Coach-controlled plan locking with confirmation
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Lock, Loader2, AlertTriangle } from 'lucide-react';

interface LockPlanButtonProps {
  canLock: boolean;
  isLocking: boolean;
  onLock: () => Promise<void>;
  disabled?: boolean;
}

export function LockPlanButton({ canLock, isLocking, onLock, disabled }: LockPlanButtonProps) {
  const [open, setOpen] = useState(false);

  const handleLock = async () => {
    await onLock();
    setOpen(false);
  };

  if (!canLock) return null;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="default" disabled={disabled || isLocking} className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-lg hover:shadow-xl transition-all">
          {isLocking ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Locking...</>) : (<><Lock className="mr-2 h-4 w-4" />Lock Plan</>)}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Confirm lock
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>You are about to lock this nutrition plan. Once locked:</p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>The plan will be saved to the database</li>
              <li>The plan will be <strong>read-only for 7 days</strong></li>
              <li>Regeneration will be blocked until the lock expires</li>
              <li>Only <strong>modification suggestions</strong> will be allowed</li>
            </ul>
            <p className="font-medium text-foreground">Are you sure you want to proceed?</p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLocking}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleLock} disabled={isLocking} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {isLocking ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Locking...</>) : (<><Lock className="mr-2 h-4 w-4" />Confirm lock</>)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface DiscardDraftButtonProps {
  onDiscard: () => void;
  disabled?: boolean;
}

export function DiscardDraftButton({ onDiscard, disabled }: DiscardDraftButtonProps) {
  const [open, setOpen] = useState(false);

  const handleDiscard = () => {
    onDiscard();
    setOpen(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={disabled} className="border-destructive/30 text-destructive hover:bg-destructive/10">
          Discard draft
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard draft?</AlertDialogTitle>
          <AlertDialogDescription>
            The current draft will be deleted. If a locked plan already exists, it will be restored.
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep draft</AlertDialogCancel>
          <AlertDialogAction onClick={handleDiscard} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Discard draft
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
