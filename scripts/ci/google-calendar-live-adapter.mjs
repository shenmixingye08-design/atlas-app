#!/usr/bin/env node
/**
 * CI quality gate for Google Calendar Production Live Adapter wiring.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];

function read(rel) {
  const path = resolve(root, rel);
  if (!existsSync(path)) {
    failures.push(`missing file: ${rel}`);
    return "";
  }
  return readFileSync(path, "utf8");
}

const registry = read("lib/automation-platform/execution/production-step-registry.ts");
if (!/wired = new Set<string>\(\[[\s\S]*google_calendar/.test(registry)) {
  failures.push("isLiveAdapterWired must include google_calendar");
}

const invoker = read("lib/automation-platform/execution/strict-step-invoker.ts");
if (!invoker.includes("invokeGoogleCalendarLiveStep")) {
  failures.push("strictStepInvoker must call invokeGoogleCalendarLiveStep");
}
const calendarCase = invoker.match(
  /case "google_calendar":\s*\{[\s\S]*?\n    case "/,
);
if (!calendarCase?.[0]?.includes("invokeGoogleCalendarLiveStep")) {
  failures.push("google_calendar case must call invokeGoogleCalendarLiveStep");
}
if (calendarCase?.[0]?.includes("invokeExternalGate")) {
  failures.push("google_calendar must not use invokeExternalGate fallback");
}

const adapter = read("lib/integrations/google/calendar/live/adapter.ts");
if (!adapter.includes("CALENDAR_ADAPTER_MODE")) {
  failures.push("Calendar live adapter missing production mode constant");
}
if (/fake eventId|fake htmlLink|mockCalendar|sandbox success/i.test(adapter)) {
  failures.push("adapter must not contain sandbox/fake success paths");
}

const crypto = read("lib/integrations/google/crypto.ts");
if (!crypto.includes("encryptGoogleSecret")) {
  failures.push("Google token encryption helper missing");
}

const oauth = read("lib/integrations/google/oauth.ts");
if (!oauth.includes("code_challenge")) {
  failures.push("Google OAuth must use PKCE");
}

const migration = read(
  "supabase/migrations/20260803_atlas_google_calendar_live_adapter.sql",
);
if (!migration.includes("atlas_google_calendar_actions")) {
  failures.push("Calendar actions migration missing");
}

const evidence = read(
  "lib/automation-platform/execution/completion-evidence-v2.ts",
);
if (
  !evidence.includes("calendarResults") ||
  !evidence.includes("CalendarStepEvidence")
) {
  failures.push("Completion Evidence must include Calendar fields");
}

if (process.env.GOOGLE_CALENDAR_LIVE_E2E === "true") {
  console.log(
    "[google-calendar-live-adapter] GOOGLE_CALENDAR_LIVE_E2E=true — run verify script with secrets",
  );
} else {
  console.log(
    "[google-calendar-live-adapter] Live E2E skipped (set GOOGLE_CALENDAR_LIVE_E2E=true with test calendar secrets)",
  );
}

if (failures.length > 0) {
  console.error("[google-calendar-live-adapter] FAIL");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(
  "[google-calendar-live-adapter] PASS — Production wiring + contract gates",
);
