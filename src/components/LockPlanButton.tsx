/**
 * LockPlanButton - Coach-controlled plan locking with confirmation
 * 
 * Shows a "Lock Plan" button that:
 * - Only appears in DRAFT state
 * - Shows confirmation dialog before locking
 * - Displays lock countdown after locking
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

export function LockPlanButton({ 
  canLock, 
  isLocking, 
  onLock,
  disabled 
}: LockPlanButtonProps) {
  const [open, setOpen] = useState(false);

  const handleLock = async () => {
    await onLock();
    setOpen(false);
  };

  if (!canLock) {
    return null;
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="default"
          disabled={disabled || isLocking}
          className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-lg hover:shadow-xl transition-all"
        >
          {isLocking ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Verrouillage...
            </>
          ) : (
            <>
              <Lock className="mr-2 h-4 w-4" />
              Verrouiller le Plan
            </>
          )}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Confirmer le verrouillage
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>
              Vous êtes sur le point de verrouiller ce plan nutritionnel. Une fois verrouillé :
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>Le plan sera enregistré dans la base de données</li>
              <li>Le plan sera <strong>en lecture seule pendant 7 jours</strong></li>
              <li>La régénération sera bloquée jusqu'à expiration du verrou</li>
              <li>Seules les <strong>suggestions de modifications</strong> seront possibles</li>
            </ul>
            <p className="font-medium text-foreground">
              Êtes-vous sûr de vouloir continuer ?
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLocking}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleLock}
            disabled={isLocking}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isLocking ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verrouillage...
              </>
            ) : (
              <>
                <Lock className="mr-2 h-4 w-4" />
                Confirmer le verrouillage
              </>
            )}
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
        <Button
          variant="outline"
          disabled={disabled}
          className="border-destructive/30 text-destructive hover:bg-destructive/10"
        >
          Annuler le brouillon
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Annuler le brouillon ?</AlertDialogTitle>
          <AlertDialogDescription>
            Le brouillon actuel sera supprimé. Si un plan verrouillé existe déjà, il sera restauré.
            Cette action est irréversible.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Garder le brouillon</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDiscard}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Annuler le brouillon
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
