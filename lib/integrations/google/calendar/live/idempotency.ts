import "server-only";

import { createHash } from "node:crypto";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import type { CalendarExternalAction, CalendarLiveAction } from "./types";

const TABLE = "atlas_google_calendar_actions" as const;

type MemoryBucket = Map<string, CalendarExternalAction>;

function memoryKey(ownerId: string, idempotencyKey: string): string {
  return `${ownerId}:${idempotencyKey}`;
}

function getMemoryBucket(): MemoryBucket {
  const scope = globalThis as typeof globalThis & {
    __atlasGoogleCalendarActions?: MemoryBucket;
  };
  if (!scope.__atlasGoogleCalendarActions) {
    scope.__atlasGoogleCalendarActions = new Map();
  }
  return scope.__atlasGoogleCalendarActions;
}

export function resetCalendarIdempotencyForTests(): void {
  getMemoryBucket().clear();
}

export function buildCalendarResultHash(action: {
  action: CalendarLiveAction;
  calendarId: string;
  eventId: string;
  htmlLink: string | null;
  startDateTime: string;
  endDateTime: string;
  timezone: string;
  titleHash: string;
  attendeeHash: string;
}): string {
  return createHash("sha256")
    .update(
      [
        action.action,
        action.calendarId,
        action.eventId,
        action.htmlLink ?? "",
        action.startDateTime,
        action.endDateTime,
        action.timezone,
        action.titleHash,
        action.attendeeHash,
      ].join("|"),
    )
    .digest("hex");
}

function rowToAction(row: Record<string, unknown>): CalendarExternalAction | null {
  const ownerId = typeof row.owner_id === "string" ? row.owner_id : null;
  const idempotencyKey =
    typeof row.idempotency_key === "string" ? row.idempotency_key : null;
  const eventId = typeof row.event_id === "string" ? row.event_id : null;
  const actionRaw = typeof row.action === "string" ? row.action : null;
  if (!ownerId || !idempotencyKey || !eventId || !actionRaw) return null;

  const status =
    row.status === "awaiting_approval"
      ? "awaiting_approval"
      : row.status === "cancelled"
        ? "cancelled"
        : "verified";

  return {
    externalActionId:
      typeof row.id === "string" ? row.id : `gcal_${eventId}`,
    service: "google_calendar",
    action: actionRaw as CalendarLiveAction,
    calendarId:
      typeof row.calendar_id === "string" ? row.calendar_id : "primary",
    eventId,
    htmlLink: typeof row.html_link === "string" ? row.html_link : null,
    hangoutLink:
      typeof row.hangout_link === "string" ? row.hangout_link : null,
    titleHash: typeof row.title_hash === "string" ? row.title_hash : "",
    startDateTime:
      typeof row.start_date_time === "string" ? row.start_date_time : "",
    endDateTime:
      typeof row.end_date_time === "string" ? row.end_date_time : "",
    timezone: typeof row.timezone === "string" ? row.timezone : "",
    attendeeHash:
      typeof row.attendee_hash === "string" ? row.attendee_hash : "",
    status,
    adapterMode: "production",
    environment:
      typeof row.environment === "string" ? row.environment : "unknown",
    providerRequestId:
      typeof row.provider_request_id === "string"
        ? row.provider_request_id
        : null,
    startedAt:
      typeof row.started_at === "string"
        ? row.started_at
        : new Date().toISOString(),
    completedAt:
      typeof row.completed_at === "string"
        ? row.completed_at
        : new Date().toISOString(),
    retryCount:
      typeof row.retry_count === "number"
        ? row.retry_count
        : Number(row.retry_count ?? 0),
    idempotencyKey,
    diagnosticId:
      typeof row.diagnostic_id === "string" ? row.diagnostic_id : "",
    resultHash: typeof row.result_hash === "string" ? row.result_hash : "",
    duplicatePrevented: true,
    approvalId: typeof row.approval_id === "string" ? row.approval_id : null,
    conflictWarned: row.conflict_warned === true,
  };
}

export async function findCalendarActionByIdempotency(input: {
  ownerId: string;
  idempotencyKey: string;
}): Promise<CalendarExternalAction | null> {
  const memory = getMemoryBucket().get(
    memoryKey(input.ownerId, input.idempotencyKey),
  );
  if (memory) return { ...memory, duplicatePrevented: true };

  const client = createServiceRoleClientIfConfigured();
  if (!client) return null;

  try {
    const unresolved = client as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (
            column: string,
            value: string,
          ) => {
            eq: (
              column: string,
              value: string,
            ) => {
              maybeSingle: () => Promise<{
                data: Record<string, unknown> | null;
                error: { message?: string } | null;
              }>;
            };
          };
        };
      };
    };
    const { data, error } = await unresolved
      .from(TABLE)
      .select("*")
      .eq("owner_id", input.ownerId)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (error || !data) return null;
    return rowToAction(data);
  } catch {
    return null;
  }
}

export async function saveCalendarExternalAction(
  action: CalendarExternalAction & {
    ownerId: string;
    organizationId?: string | null;
    runId: string;
    stepId: string;
  },
): Promise<void> {
  getMemoryBucket().set(memoryKey(action.ownerId, action.idempotencyKey), {
    ...action,
    duplicatePrevented: false,
  });

  const client = createServiceRoleClientIfConfigured();
  if (!client) return;

  try {
    const unresolved = client as unknown as {
      from: (table: string) => {
        upsert: (
          row: Record<string, unknown>,
          options: { onConflict: string },
        ) => Promise<{ error: { message?: string } | null }>;
      };
    };
    await unresolved.from(TABLE).upsert(
      {
        id: action.externalActionId,
        owner_id: action.ownerId,
        organization_id: action.organizationId ?? null,
        run_id: action.runId,
        step_id: action.stepId,
        action: action.action,
        calendar_id: action.calendarId,
        event_id: action.eventId,
        html_link: action.htmlLink,
        hangout_link: action.hangoutLink,
        title_hash: action.titleHash,
        start_date_time: action.startDateTime,
        end_date_time: action.endDateTime,
        timezone: action.timezone,
        attendee_hash: action.attendeeHash,
        status: action.status,
        adapter_mode: action.adapterMode,
        environment: action.environment,
        provider_request_id: action.providerRequestId,
        started_at: action.startedAt,
        completed_at: action.completedAt,
        retry_count: action.retryCount,
        idempotency_key: action.idempotencyKey,
        diagnostic_id: action.diagnosticId,
        result_hash: action.resultHash,
        approval_id: action.approvalId,
        conflict_warned: action.conflictWarned,
      },
      { onConflict: "owner_id,idempotency_key" },
    );
  } catch {
    // Memory already holds the action.
  }
}
