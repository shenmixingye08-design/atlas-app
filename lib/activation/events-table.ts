import "server-only";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import { isActivationEventName } from "./privacy";
import type { ActivationEventPayload } from "./types";

export const ACTIVATION_EVENTS_TABLE = "atlas_activation_events";

type ActivationEventsClient = {
  from: (table: string) => {
    upsert: (
      row: Record<string, unknown>,
      options?: { onConflict?: string },
    ) => PromiseLike<{ error: { message?: string } | null }>;
    select: (cols: string) => {
      gte: (col: string, value: string) => {
        lte: (col: string, value: string) => {
          limit: (n: number) => PromiseLike<{
            data: Array<Record<string, unknown>> | null;
            error: { message?: string } | null;
          }>;
        };
      };
    };
  };
};

function eventsClient(): ActivationEventsClient | null {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return null;
  return client as unknown as ActivationEventsClient;
}

export async function insertActivationEventRow(
  event: ActivationEventPayload,
): Promise<boolean> {
  const client = eventsClient();
  if (!client) return false;
  try {
    const { error } = await client.from(ACTIVATION_EVENTS_TABLE).upsert(
      {
        user_id: event.userId,
        event_name: event.event,
        idempotency_key: event.idempotencyKey,
        occurred_at: event.occurredAt,
        payload: {
          sourcePage: event.sourcePage,
          selectedGoal: event.selectedGoal,
          jobType: event.jobType,
          success: event.success,
          diagnosticId: event.diagnosticId,
          plan: event.plan,
          deviceCategory: event.deviceCategory,
          appVersion: event.appVersion,
        },
      },
      { onConflict: "user_id,event_name,idempotency_key" },
    );
    return !error;
  } catch {
    return false;
  }
}

export async function listActivationEventRows(input: {
  from: string;
  to: string;
}): Promise<ActivationEventPayload[]> {
  const client = eventsClient();
  if (!client) return [];
  try {
    const { data, error } = await client
      .from(ACTIVATION_EVENTS_TABLE)
      .select("user_id,event_name,idempotency_key,occurred_at,payload")
      .gte("occurred_at", input.from)
      .lte("occurred_at", input.to)
      .limit(5000);
    if (error || !Array.isArray(data)) return [];
    return data.flatMap((row) => {
      const payload =
        row.payload && typeof row.payload === "object"
          ? (row.payload as Record<string, unknown>)
          : {};
      if (typeof row.user_id !== "string" || !isActivationEventName(row.event_name)) {
        return [];
      }
      return [
        {
          event: row.event_name,
          userId: row.user_id,
          occurredAt:
            typeof row.occurred_at === "string"
              ? row.occurred_at
              : new Date().toISOString(),
          sourcePage:
            typeof payload.sourcePage === "string" ? payload.sourcePage : null,
          selectedGoal:
            typeof payload.selectedGoal === "string"
              ? (payload.selectedGoal as ActivationEventPayload["selectedGoal"])
              : null,
          jobType: typeof payload.jobType === "string" ? payload.jobType : null,
          success: typeof payload.success === "boolean" ? payload.success : null,
          diagnosticId:
            typeof payload.diagnosticId === "string"
              ? payload.diagnosticId
              : null,
          plan: typeof payload.plan === "string" ? payload.plan : null,
          deviceCategory:
            payload.deviceCategory === "mobile" ||
            payload.deviceCategory === "tablet" ||
            payload.deviceCategory === "desktop"
              ? payload.deviceCategory
              : "unknown",
          appVersion:
            typeof payload.appVersion === "string" ? payload.appVersion : null,
          idempotencyKey:
            typeof row.idempotency_key === "string"
              ? row.idempotency_key
              : `${row.event_name}:${row.user_id}`,
        } satisfies ActivationEventPayload,
      ];
    });
  } catch {
    return [];
  }
}
