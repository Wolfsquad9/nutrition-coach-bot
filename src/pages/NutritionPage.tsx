/**
 * Nutrition tab page — extracted from Index.tsx
 */

import { useAppLayout } from '@/hooks/useAppLayout';
import { NoClientGuard } from '@/components/NoClientGuard';
import { NutritionTabContent } from '@/components/NutritionTabContent';

export default function NutritionPage() {
  const { activeClientId, activeClient, clientRestrictions } = useAppLayout();

  if (!activeClientId || !activeClient) {
    return <NoClientGuard message="Select or create a client in the Client tab to generate a nutrition plan." />;
  }

  return (
    <NutritionTabContent
      activeClientId={activeClientId}
      activeClient={activeClient}
      clientRestrictions={clientRestrictions}
    />
  );
}
