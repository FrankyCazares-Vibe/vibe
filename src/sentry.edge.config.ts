import * as Sentry from "@sentry/nextjs";

import { getSentryInitOptions } from "@/lib/sentry-config";

Sentry.init(getSentryInitOptions());
