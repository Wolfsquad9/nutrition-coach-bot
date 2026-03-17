/**
 * Redirect page — the old Index.tsx is replaced by route-based pages.
 * This file exists only to avoid breaking any stale imports.
 */
import { Navigate } from 'react-router-dom';

export default function Index() {
  return <Navigate to="/" replace />;
}
