import "server-only";

import { structuredLog } from "./structured-log";
import { getCorrelationIds } from "./correlation";

export type ProductionAlertChannel = "slack" | "email" | "discord" | "webhook";

export type ProductionAlertPayload = {
  title: string;
  message: string;
  severity: "info" | "warn" | "error" | "critical";
  kind: string;
  at: string;
  correlationId: string;
  channelsAttempted: ProductionAlertChannel[];
  channelsSucceeded: ProductionAlertChannel[];
};

type MemoryScope = typeof globalThis & {
  __atlasAlertCooldown?: Map<string, number>;
  __atlasAlertHistory?: ProductionAlertPayload[];
};

const COOLDOWN_MS = 5 * 60 * 1000;

function cooldownMap(): Map<string, number> {
  const scope = globalThis as MemoryScope;
  if (!scope.__atlasAlertCooldown) scope.__atlasAlertCooldown = new Map();
  return scope.__atlasAlertCooldown;
}

function history(): ProductionAlertPayload[] {
  const scope = globalThis as MemoryScope;
  if (!scope.__atlasAlertHistory) scope.__atlasAlertHistory = [];
  return scope.__atlasAlertHistory;
}

async function postJson(
  url: string,
  body: unknown,
): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function sendSlack(text: string): Promise<boolean> {
  const url = process.env.ATLAS_ALERT_SLACK_WEBHOOK_URL?.trim();
  if (!url) return false;
  return postJson(url, { text });
}

async function sendDiscord(text: string): Promise<boolean> {
  const url = process.env.ATLAS_ALERT_DISCORD_WEBHOOK_URL?.trim();
  if (!url) return false;
  return postJson(url, { content: text.slice(0, 1900) });
}

async function sendGenericWebhook(payload: ProductionAlertPayload): Promise<boolean> {
  const url = process.env.ATLAS_ALERT_WEBHOOK_URL?.trim();
  if (!url) return false;
  return postJson(url, payload);
}

async function sendEmail(payload: ProductionAlertPayload): Promise<boolean> {
  const url = process.env.ATLAS_ALERT_EMAIL_WEBHOOK_URL?.trim();
  if (!url) return false;
  return postJson(url, {
    to: process.env.ATLAS_ALERT_EMAIL_TO?.trim() || undefined,
    subject: `[MINERVOT ${payload.severity}] ${payload.title}`,
    text: payload.message,
    correlationId: payload.correlationId,
  });
}

/**
 * Fan-out operational alerts to Slack / Email / Discord / Webhook.
 * Same-kind cooldown prevents spam. Missing env = channel skipped (not failure).
 */
export async function dispatchProductionAlert(input: {
  title: string;
  message: string;
  severity?: ProductionAlertPayload["severity"];
  kind: string;
  force?: boolean;
}): Promise<ProductionAlertPayload> {
  const severity = input.severity ?? "error";
  const now = Date.now();
  const key = `${input.kind}:${severity}`;
  const last = cooldownMap().get(key) ?? 0;
  if (!input.force && now - last < COOLDOWN_MS) {
    const skipped: ProductionAlertPayload = {
      title: input.title,
      message: input.message.slice(0, 1000),
      severity,
      kind: input.kind,
      at: new Date().toISOString(),
      correlationId: getCorrelationIds().correlationId,
      channelsAttempted: [],
      channelsSucceeded: [],
    };
    return skipped;
  }
  cooldownMap().set(key, now);

  const payload: ProductionAlertPayload = {
    title: input.title.slice(0, 200),
    message: input.message.slice(0, 1000),
    severity,
    kind: input.kind,
    at: new Date().toISOString(),
    correlationId: getCorrelationIds().correlationId,
    channelsAttempted: [],
    channelsSucceeded: [],
  };

  const text = `【MINERVOT ${severity}】${payload.title}\n${payload.message}\ncor=${payload.correlationId}`;

  const attempts: Array<[ProductionAlertChannel, () => Promise<boolean>]> = [
    ["slack", () => sendSlack(text)],
    ["discord", () => sendDiscord(text)],
    ["email", () => sendEmail(payload)],
    ["webhook", () => sendGenericWebhook(payload)],
  ];

  for (const [channel, send] of attempts) {
    // Only attempt if env likely configured — still mark attempted when URL present
    const configured =
      (channel === "slack" && process.env.ATLAS_ALERT_SLACK_WEBHOOK_URL?.trim()) ||
      (channel === "discord" &&
        process.env.ATLAS_ALERT_DISCORD_WEBHOOK_URL?.trim()) ||
      (channel === "email" && process.env.ATLAS_ALERT_EMAIL_WEBHOOK_URL?.trim()) ||
      (channel === "webhook" && process.env.ATLAS_ALERT_WEBHOOK_URL?.trim());
    if (!configured) continue;
    payload.channelsAttempted.push(channel);
    if (await send()) payload.channelsSucceeded.push(channel);
  }

  history().unshift(payload);
  if (history().length > 100) history().length = 100;

  structuredLog(
    severity === "info" ? "info" : severity === "warn" ? "warn" : "error",
    `alert:${input.kind}`,
    {
      event: "production_alert",
      status: payload.channelsSucceeded.length > 0 ? "ok" : "degraded",
      meta: {
        attempted: payload.channelsAttempted.join(","),
        succeeded: payload.channelsSucceeded.join(","),
      },
    },
  );

  return payload;
}

export function listProductionAlertsForTests(): ProductionAlertPayload[] {
  return [...history()];
}

export function resetProductionAlertsForTests(): void {
  (globalThis as MemoryScope).__atlasAlertCooldown = new Map();
  (globalThis as MemoryScope).__atlasAlertHistory = [];
}

export function getConfiguredAlertChannels(): ProductionAlertChannel[] {
  const channels: ProductionAlertChannel[] = [];
  if (process.env.ATLAS_ALERT_SLACK_WEBHOOK_URL?.trim()) channels.push("slack");
  if (process.env.ATLAS_ALERT_EMAIL_WEBHOOK_URL?.trim()) channels.push("email");
  if (process.env.ATLAS_ALERT_DISCORD_WEBHOOK_URL?.trim()) channels.push("discord");
  if (process.env.ATLAS_ALERT_WEBHOOK_URL?.trim()) channels.push("webhook");
  return channels;
}
