/**
 * Guard component displayed when no client is selected
 */

import { Card } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

interface NoClientGuardProps {
  message?: string;
}

export function NoClientGuard({ 
  message = 'Please select or create a client to continue.' 
}: NoClientGuardProps) {
  return (
    <Card className="p-8 shadow-card">
      <div className="flex flex-col items-center justify-center text-center py-8">
        <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">
          No client selected
        </h3>
        <p className="text-muted-foreground max-w-md">
          {message}
        </p>
      </div>
    </Card>
  );
}
