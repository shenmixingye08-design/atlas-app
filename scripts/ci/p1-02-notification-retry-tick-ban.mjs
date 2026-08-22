#!/usr/bin/env node
/**
 * CI gate (P1-02): notification retry drain must be wired into automation tick.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const violations = [];

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

const tick = read("lib/automations/tick-runner.ts");
if (!/processDurableNotificationRetries/.test(tick)) {
  violations.push(
    "lib/automations/tick-runner.ts: must call processDurableNotificationRetries",
  );
}
if (!/notificationRetries/.test(tick)) {
  violations.push(
    "lib/automations/tick-runner.ts: must expose notificationRetries in response",
  );
}

const drain = read("lib/notifications/retry-drain.ts");
if (!/export async function processDurableNotificationRetries/.test(drain)) {
  violations.push(
    "lib/notifications/retry-drain.ts: processDurableNotificationRetries missing",
  );
}
if (!/dlqReinjected/.test(drain)) {
  violations.push(
    "lib/notifications/retry-drain.ts: must track dlqReinjected=0 (no DLQ auto-replay)",
  );
}
if (!/executeIdempotentSideEffect/.test(drain)) {
  violations.push(
    "lib/notifications/retry-drain.ts: must use P1-04 executeIdempotentSideEffect",
  );
}

const durable = read("lib/notifications/durable-inbox.ts");
if (!/claimDueDeliveryRetry/.test(durable)) {
  violations.push(
    "lib/notifications/durable-inbox.ts: claimDueDeliveryRetry missing",
  );
}

const service = read("lib/notifications/service.ts");
if (!/created &&/.test(service) && !/created\s*&&/.test(service)) {
  violations.push(
    "lib/notifications/service.ts: must skip external delivery on idempotent reuse",
  );
}

if (violations.length > 0) {
  console.error("P1-02 notification retry/tick gate FAILED:");
  for (const v of violations) console.error(` - ${v}`);
  process.exit(1);
}

console.log("P1-02 notification retry/tick gate OK");
