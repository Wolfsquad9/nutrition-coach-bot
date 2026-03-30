import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Share2, Check, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { generateShareLink } from '@/services/sharePlanService';

interface SharePlanButtonProps {
  versionId: string | null;
  isShareable: boolean;
}

export function SharePlanButton({ versionId, isShareable }: SharePlanButtonProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  if (!isShareable || !versionId) return null;

  const handleShare = async () => {
    const link = generateShareLink(versionId);

    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast({ title: 'Link copied!', description: 'Share this link with your client.' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select from a prompt
      window.prompt('Copy this link:', link);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleShare} className="gap-2">
      {copied ? (
        <><Check className="h-4 w-4 text-success" />Copied</>
      ) : (
        <><Share2 className="h-4 w-4" />Share Plan</>
      )}
    </Button>
  );
}
