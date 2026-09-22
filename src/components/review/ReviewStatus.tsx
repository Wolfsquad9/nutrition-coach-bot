/**
 * ReviewStatus — the CLIENT REVIEW header: client identity + authoritative
 * review status badge. Color is never the only cue (the label carries meaning).
 */

import { User } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { presentClientReviewStatus, formatDate } from './reviewPresentation';
import { getClientLabel } from '@/utils/clientHelpers';
import type { Client } from '@/types';
import type { ClientReview } from '@/domain/review/reviewModel';

export interface ReviewStatusProps {
  client: Client;
  review: ClientReview;
}

export function ReviewStatus({ client, review }: ReviewStatusProps) {
  const presentation = presentClientReviewStatus(review.status);

  return (
    <Card className="p-5 shadow-card bg-muted/30">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <User className="h-6 w-6 text-muted-foreground" />
          <div>
            <h2 className="text-2xl font-bold text-foreground">{getClientLabel(client)}</h2>
            <p className="text-sm text-muted-foreground">Client Review</p>
          </div>
        </div>
        <div className="flex flex-col items-start gap-1 text-sm">
          <Badge variant="outline" className={presentation.className}>
            {presentation.label}
          </Badge>
          <span className="text-xs text-muted-foreground">
            Updated from evidence as of {formatDate(client.updatedAt)}
          </span>
        </div>
      </div>
      <div className="mt-3">
        <p className="font-medium text-foreground">{review.summary}</p>
      </div>
    </Card>
  );
}