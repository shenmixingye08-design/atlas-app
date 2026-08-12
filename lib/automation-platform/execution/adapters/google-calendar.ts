import "server-only";

import type { ExternalAdapter } from "@/lib/automation-platform/execution/adapters/types";
import {
  configMissingInput,
  configString,
  externalSuccess,
  mapProviderFailure,
  mapThrownProviderError,
} from "@/lib/automation-platform/execution/adapters/map-provider-status";
import { resolveAutomationFeatureContext } from "@/lib/automation-platform/execution/adapters/resolve-context";
import { createCalendarEventForUser } from "@/lib/integrations/google/calendar/service";

function resolveEventWindow(configuration: Readonly<Record<string, unknown>>): {
  startAt: string;
  endAt: string;
} | null {
  const startAt = configString(configuration, [
    "startAt",
    "start",
    "eventStartAt",
  ]);
  const endAt = configString(configuration, ["endAt", "end", "eventEndAt"]);
  if (startAt && endAt) return { startAt, endAt };

  // Default: 1-hour block starting one hour from now (Asia/Tokyo-safe ISO).
  const start = new Date(Date.now() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

export const invokeGoogleCalendarAdapter: ExternalAdapter = async (input) => {
  const action =
    configString(input.step.configuration, ["action"]) || "create";
  if (action !== "create") {
    return {
      ok: false,
      summary: `Google Calendarの${action}はAutomationから未対応です`,
      artifacts: [],
      errorCode: "step_not_implemented",
      errorMessage: `google_calendar_${action}_not_available`,
      failedStage: "EXTERNAL_ADAPTER_RESOLUTION",
      retryable: false,
    };
  }

  const title = configString(input.step.configuration, [
    "eventTitle",
    "title",
    "name",
  ]);
  if (!title) {
    return configMissingInput("予定タイトルが設定されていません");
  }

  const window = resolveEventWindow(input.step.configuration);
  if (!window) {
    return configMissingInput("予定の開始・終了時刻が設定されていません");
  }

  const description = configString(input.step.configuration, [
    "description",
    "body",
    "content",
  ]);
  const location = configString(input.step.configuration, ["location"]);

  try {
    const context = await resolveAutomationFeatureContext(input.userId);
    const result = await createCalendarEventForUser({
      userId: input.userId,
      context,
      event: {
        title,
        startAt: window.startAt,
        endAt: window.endAt,
        description: description || null,
        location: location || null,
      },
      automationId: input.automationId,
      runId: input.runId,
      occurrenceKey: input.runId,
      discriminator: input.step.id,
    });

    if (result.status !== "ready") {
      return mapProviderFailure({
        service: "Google Calendar",
        status: result.status,
        message: result.message,
      });
    }

    return externalSuccess({
      summary: "Google Calendarに予定を登録しました",
      provider: "google_calendar",
      operation: "create_event",
      resourceId: result.event.id,
      url: result.event.htmlLink,
      label: result.event.title,
    });
  } catch (error) {
    return mapThrownProviderError("Google Calendar", error);
  }
};
