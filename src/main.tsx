/**
 * Application bootstrap.
 *
 * Sentry SDK was removed because no real VITE_SENTRY_DSN is configured —
 * the .env value is a placeholder that causes a misleading "Invalid Sentry DSN"
 * boot warning with zero observability. Errors are handled by the in-memory
 * logger in src/utils/logger (PII-safe, console-backed, no bundle penalty).
 */

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <App />
);
