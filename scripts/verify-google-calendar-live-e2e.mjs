#!/usr/bin/env node
/**
 * Opt-in real Google Calendar API Live E2E.
 */

if (process.env.GOOGLE_CALENDAR_LIVE_E2E !== "true") {
  console.log(
    "[verify-google-calendar-live-e2e] skipped — set GOOGLE_CALENDAR_LIVE_E2E=true to run",
  );
  process.exit(0);
}

const required = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "ATLAS_GOOGLE_CREDENTIALS_ENCRYPTION_KEY",
  "GOOGLE_CALENDAR_LIVE_E2E_REFRESH_TOKEN",
];

const missing = required.filter((key) => !process.env[key]?.trim());
if (missing.length > 0) {
  console.error(
    `[verify-google-calendar-live-e2e] missing secrets: ${missing.join(", ")}`,
  );
  process.exit(1);
}

console.error(
  "[verify-google-calendar-live-e2e] Full Node harness not bundled in CI — use Vitest contract suite plus manual test-calendar runs documented in docs/development/google-calendar-live-adapter.md",
);
process.exit(1);
