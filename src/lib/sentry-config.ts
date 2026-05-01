import type { BrowserOptions } from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

/** Shared defaults — browser + Node + Edge. Disabled when DSN unset (local dev without Sentry). */
export function getSentryInitOptions(): BrowserOptions {
  const enabled = Boolean(dsn);
  return {
    dsn: enabled ? dsn : undefined,
    enabled,
    environment:
      process.env.VERCEL_ENV ??
      process.env.NODE_ENV ??
      "development",
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1 : 0.1,
    sendDefaultPii: false,
  };
}

export function isSentryConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN?.trim());
}
