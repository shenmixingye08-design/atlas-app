import "server-only";

import { buildFeatureAccessContext } from "@/lib/feature-flags/access";
import {
  createCalendarEventForUser,
  getGoogleCalendarEventsForUser,
} from "@/lib/integrations/google/calendar/service";

import { hashContent } from "../idempotency";
import { buildExecutionResult } from "../result";
import type {
  AdapterExecuteInput,
  LiveIntegrationAdapter,
  ValidationResult,
} from "../types";
import {
  failValidation,
  okValidation,
  standardIdempotencyKey,
  withAdapterGuards,
} from "./shared";

async function validateCalendar(userId: string): Promise<ValidationResult> {
  const result = await getGoogleCalendarEventsForUser({
    userId,
    context: buildFeatureAccessContext(null),
    range: "today",
  });
  if (result.status !== "ready") {
    return failValidation(
      result.status === "feature_disabled"
        ? "needs_configuration"
        : "needs_connection",
      result.message,
    );
  }
  return okValidation("Google Calendar接続済み");
}

export const googleCalendarLiveAdapter: LiveIntegrationAdapter = {
  id: "live.google_calendar.create",
  service: "google_calendar",
  mode: "production",
  availability: "available",
  classification: "production_live",
  requiresExternalActionId: true,
  validateConnection: validateCalendar,
  validatePermissions: validateCalendar,
  async execute(input: AdapterExecuteInput) {
    const title =
      typeof input.configuration.title === "string"
        ? input.configuration.title.trim()
        : typeof input.configuration.summary === "string"
          ? input.configuration.summary.trim()
          : "ATLAS予定";
    const startAt =
      typeof input.configuration.startAt === "string"
        ? input.configuration.startAt
        : typeof input.configuration.start === "string"
          ? input.configuration.start
          : new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const endAt =
      typeof input.configuration.endAt === "string"
        ? input.configuration.endAt
        : typeof input.configuration.end === "string"
          ? input.configuration.end
          : new Date(Date.parse(startAt) + 60 * 60 * 1000).toISOString();
    const eventKey = `${title}|${startAt}|${endAt}`;
    const contentHash = input.contentHash ?? hashContent(eventKey);
    const key = standardIdempotencyKey(
      "google_calendar",
      { ...input, contentHash },
      { account: input.userId, eventKey },
    );

    return withAdapterGuards({
      adapter: this,
      executeInput: input,
      idempotencyKey: key,
      run: async () => {
        const startedAt = new Date().toISOString();
        const result = await createCalendarEventForUser({
          userId: input.userId,
          context: buildFeatureAccessContext(null),
          event: {
            title,
            description:
              typeof input.configuration.description === "string"
                ? input.configuration.description
                : "",
            startAt,
            endAt,
            remindMinutesBefore:
              typeof input.configuration.remindMinutesBefore === "number"
                ? input.configuration.remindMinutesBefore
                : 30,
          },
        });

        if (result.status !== "ready" || !result.event?.id) {
          return buildExecutionResult({
            status:
              result.status === "feature_disabled"
                ? "needs_configuration"
                : "needs_connection",
            startedAt,
            errorCode: result.status,
            summary: "message" in result ? result.message : "Calendar失敗",
            requiresExternalActionId: false,
            costUsage: { providerCalls: 1 },
          });
        }

        const htmlLink = result.event.htmlLink ?? null;
        if (!htmlLink) {
          return buildExecutionResult({
            status: "failed",
            startedAt,
            externalActionId: result.event.id,
            errorCode: "missing_external_url",
            summary: "Calendar htmlLink が取得できませんでした",
            requiresExternalActionId: false,
            costUsage: { providerCalls: 1 },
          });
        }

        return buildExecutionResult({
          status: "succeeded",
          externalActionId: result.event.id,
          externalUrl: htmlLink,
          startedAt,
          summary: `カレンダー予定を作成しました: ${htmlLink}`,
          requiresExternalActionId: true,
          costUsage: { providerCalls: 1 },
        });
      },
    });
  },
};
