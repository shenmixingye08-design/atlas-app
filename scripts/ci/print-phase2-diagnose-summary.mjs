#!/usr/bin/env node
import { readFileSync } from "node:fs";

const path =
  process.argv[2] ||
  "/home/runner/work/_temp/diagnose-automation-run/health-diagnose.json";
const d = JSON.parse(readFileSync(path, "utf8"));
const run = d.run || {};
const auto = d.automation || {};
const derived = d.derived || {};
process.stdout.write(
  `${JSON.stringify(
    {
      ok: d.ok,
      lookup: d.lookup,
      automationId: run.automationId || auto.id,
      runId: run.id,
      occurrenceKey: run.scheduleOccurrenceKey,
      status: run.status,
      approvalStatus: run.approvalStatus,
      googleCalendarStepStatus: run.googleCalendarStepStatus,
      googleCalendarEventIds: run.googleCalendarEventIds,
      externalActionIds: run.externalActionIds,
      completionEvidence: run.completionEvidence,
      transitionReasons: run.transitionReasons,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      freeformNotesPreview: auto.freeformNotesPreview,
      hasGoogleCalendarStep: auto.hasGoogleCalendarStep,
      enabledStepTypes: auto.enabledStepTypes,
      derived,
      resultSummary: run.resultSummary,
      phase2: d.phase2 || null,
      scanSummary: d.scanSummary || null,
      error: d.error || null,
    },
    null,
    2,
  )}\n`,
);

