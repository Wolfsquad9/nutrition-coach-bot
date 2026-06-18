/**
 * Application bootstrap.
 *
 * Sentry initialization is gated on `VITE_SENTRY_DSN`:
 *  - If the DSN is set, errors and unhandled exceptions are reported to Sentry.
 *  - If not set, Sentry stays inactive (no-op). The logger still works locally.
 *
 * To enable: set `VITE_SENTRY_DSN` in `.env` to the DSN from your Sentry project
 * (https://sentry.io → Project Settings → Client Keys → DSN).
 */

import * as Sentry from "@sentry/react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    // Sample 10% of performance traces to stay under free-tier limits.
    // Bump to 1.0 once you have a paid plan or want full visibility.
    tracesSampleRate: 0.1,
    // Don't send errors from local dev or test environments.
    environment: import.meta.env.MODE,
    // Strip PII before sending — never send emails/tokens to Sentry.
    sendDefaultPii: false,
  });
}

createRoot(document.getElementById("root")!).render(
  SENTRY_DSN ? (
    <Sentry.ErrorBoundary fallback={<App />}>
      <App />
    </Sentry.ErrorBoundary>
  ) : (
    <App />
  )
);
