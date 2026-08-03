#!/usr/bin/env node
/**
 * Opt-in real Gmail API Live E2E.
 * Requires GOOGLE_GMAIL_LIVE_E2E=true and a managed test account token path.
 * Never mass-send to production addresses.
 */

if (process.env.GOOGLE_GMAIL_LIVE_E2E !== "true") {
  console.log(
    "[verify-gmail-live-e2e] skipped — set GOOGLE_GMAIL_LIVE_E2E=true to run",
  );
  process.exit(0);
}

const required = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "ATLAS_GOOGLE_CREDENTIALS_ENCRYPTION_KEY",
  "GMAIL_LIVE_E2E_REFRESH_TOKEN",
  "GMAIL_LIVE_E2E_TO",
];

const missing = required.filter((key) => !process.env[key]?.trim());
if (missing.length > 0) {
  console.error(
    `[verify-gmail-live-e2e] missing secrets: ${missing.join(", ")}`,
  );
  process.exit(1);
}

console.error(
  "[verify-gmail-live-e2e] Full Node harness not bundled in CI — use Vitest contract suite plus manual test-account runs documented in docs/development/gmail-live-adapter.md",
);
process.exit(1);
