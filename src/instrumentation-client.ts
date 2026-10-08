import * as Sentry from "@sentry/nextjs";

import { getSentryInitOptions } from "@/lib/sentry-config";

Sentry.init({
  ...getSentryInitOptions(),
  // The trail a report carries keeps the pages opened, the requests made and
  // our own log lines, and no longer the buttons tapped (Privacy Policy 3d,
  // October 8, 2026): a tap's label says what a person was doing, and the
  // rest is what finds a bug. Same name as the default, so it replaces it.
  integrations: [Sentry.breadcrumbsIntegration({ dom: false })],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
