import { useOutletContext } from 'react-router-dom';
import type { AppLayoutContext } from '@/components/AppLayout';

export function useAppLayout() {
  return useOutletContext<AppLayoutContext>();
}
