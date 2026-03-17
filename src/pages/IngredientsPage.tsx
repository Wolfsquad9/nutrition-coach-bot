/**
 * Ingredients tab page — extracted from Index.tsx
 */

import { useAppLayout } from '@/hooks/useAppLayout';
import { NoClientGuard } from '@/components/NoClientGuard';
import EnhancedIngredientManager from '@/components/EnhancedIngredientManager';

export default function IngredientsPage() {
  const { activeClientId, activeClient, setClientRestrictions } = useAppLayout();

  if (!activeClientId || !activeClient) {
    return <NoClientGuard message="Select or create a client in the Client tab to manage their ingredients." />;
  }

  return (
    <EnhancedIngredientManager
      activeClientId={activeClientId}
      activeClient={activeClient}
      onRestrictionsUpdate={setClientRestrictions}
    />
  );
}
