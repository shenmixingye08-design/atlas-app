#!/usr/bin/env node
/**
 * Optional live E2E against real Google Drive API.
 * Requires GOOGLE_DRIVE_LIVE_E2E=true and a connected test user token path.
 *
 * This script does NOT invent success without provider credentials.
 */

if (process.env.GOOGLE_DRIVE_LIVE_E2E !== "true") {
  console.log(
    "SKIP: GOOGLE_DRIVE_LIVE_E2E!=true — live Google Drive E2E not executed",
  );
  console.log(
    "Contract/integration tests cover Production adapter fail-closed behavior.",
  );
  process.exit(0);
}

const required = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "ATLAS_GOOGLE_CREDENTIALS_ENCRYPTION_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];
const missing = required.filter((key) => !process.env[key]?.trim());
if (missing.length > 0) {
  console.error(
    "FAIL: GOOGLE_DRIVE_LIVE_E2E=true but missing env:",
    missing.join(", "),
  );
  process.exit(1);
}

console.error(
  "FAIL: Live E2E harness requires an interactive connected test account runner.",
);
console.error(
  "Use Vitest contract suite locally, then run a controlled operator playbook with a dedicated Google test account.",
);
process.exit(1);
