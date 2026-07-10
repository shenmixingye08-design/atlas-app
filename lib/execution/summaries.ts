import type { ActionRequest } from "@/lib/actions/types";
import { ui } from "@/lib/i18n";

import type { ExecutionSummary, SimulationPhase } from "./types";

/** Generate a realistic sandbox execution summary for an action. */
export function generateExecutionSummary(action: ActionRequest): ExecutionSummary {
  const key = `${action.providerId}:${action.serviceId}`;

  switch (key) {
    case "google:google_drive":
      return {
        summary: ui.execution.summaryDriveSaved,
        detail: ui.execution.detailDriveFolder,
      };
    case "wordpress:posts":
      return {
        summary: ui.execution.summaryBlogPublished,
        detail: ui.execution.detailPreviewUrl,
      };
    case "google:gmail":
      return {
        summary: ui.execution.summaryEmailPrepared,
        detail: ui.execution.detailEmailQueued,
      };
    case "notion:pages":
      return {
        summary: ui.execution.summaryNotionPage,
        detail: null,
      };
    case "google:google_calendar":
      return {
        summary: ui.execution.summaryCalendarScheduled,
        detail: null,
      };
    case "atlas:knowledge":
      return {
        summary: ui.execution.summaryKnowledgeSaved,
        detail: ui.execution.detailKnowledgeAdded,
      };
    case "atlas:automations":
      return {
        summary: ui.execution.summaryWorkflowScheduled,
        detail: ui.execution.detailWorkflowQueued,
      };
    case "meta:threads":
    case "meta:instagram":
    case "meta:facebook":
      return {
        summary: ui.execution.summarySocialPrepared,
        detail: ui.execution.detailSocialQueued,
      };
    case "microsoft:outlook":
      return {
        summary: ui.execution.summaryMessagePrepared,
        detail: ui.execution.detailEmailQueued,
      };
    case "slack:messages":
    case "discord:messages":
      return {
        summary: ui.execution.summaryNotificationSent,
        detail: ui.execution.detailChannelSimulated,
      };
    default:
      return {
        summary: ui.execution.summaryDefault,
        detail: ui.execution.detailDefault(action.providerName, action.targetService),
      };
  }
}

export function phaseLabel(phase: SimulationPhase): string {
  switch (phase) {
    case "queued":
      return ui.execution.phaseQueued;
    case "preparing":
      return ui.execution.phasePreparing;
    case "executing":
      return ui.execution.phaseExecuting;
    case "completed":
      return ui.execution.phaseCompleted;
  }
}
