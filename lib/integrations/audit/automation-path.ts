/**
 * Phase 3-1 — Automation → Provider call path visualization facts.
 */

export type AutomationPathNode =
  | "Automation"
  | "Run"
  | "Job"
  | "Step"
  | "StepInvoker"
  | "AdapterRegistry"
  | "Adapter"
  | "ProviderAPI"
  | "ExecutionResult"
  | "ExternalActionSave"
  | "CompletionEvidence"
  | "Notification";

export type AutomationPathTrace = {
  serviceId: string;
  pathName: string;
  nodes: Array<{
    node: AutomationPathNode;
    status: "ok" | "broken" | "partial" | "n/a";
    detail: string;
  }>;
  brokenAt: AutomationPathNode | null;
};

export const AUTOMATION_PATH_TRACES: readonly AutomationPathTrace[] = [
  {
    serviceId: "gmail",
    pathName: "V2 Automation gmail step",
    nodes: [
      { node: "Automation", status: "ok", detail: "V2 automation model" },
      { node: "Run", status: "ok", detail: "durable runs" },
      { node: "Job", status: "ok", detail: "executor job loop" },
      { node: "Step", status: "ok", detail: "type=gmail registered" },
      {
        node: "StepInvoker",
        status: "partial",
        detail: "strictStepInvoker.invokeExternalGate",
      },
      {
        node: "AdapterRegistry",
        status: "ok",
        detail: "production-step-registry requiredAdapter=google_gmail",
      },
      {
        node: "Adapter",
        status: "broken",
        detail: "isLiveAdapterWired(google_gmail)=false",
      },
      { node: "ProviderAPI", status: "broken", detail: "never called from V2" },
      {
        node: "ExecutionResult",
        status: "broken",
        detail: "live_adapter_missing",
      },
      {
        node: "ExternalActionSave",
        status: "broken",
        detail: "no externalActionId produced",
      },
      {
        node: "CompletionEvidence",
        status: "broken",
        detail: "cannot complete external step",
      },
      {
        node: "Notification",
        status: "partial",
        detail: "failure/needs_input notifications only",
      },
    ],
    brokenAt: "Adapter",
  },
  {
    serviceId: "x",
    pathName: "V2 Automation x_post step",
    nodes: [
      { node: "Automation", status: "ok", detail: "V2" },
      { node: "Run", status: "ok", detail: "V2 run" },
      { node: "Job", status: "ok", detail: "executor" },
      { node: "Step", status: "ok", detail: "type=x_post" },
      { node: "StepInvoker", status: "partial", detail: "external gate" },
      { node: "AdapterRegistry", status: "ok", detail: "requiredAdapter=x" },
      {
        node: "Adapter",
        status: "broken",
        detail: "isLiveAdapterWired(x)=false",
      },
      { node: "ProviderAPI", status: "broken", detail: "not reached via V2" },
      { node: "ExecutionResult", status: "broken", detail: "live_adapter_missing" },
      { node: "ExternalActionSave", status: "broken", detail: "n/a" },
      { node: "CompletionEvidence", status: "broken", detail: "n/a" },
      { node: "Notification", status: "partial", detail: "failure path" },
    ],
    brokenAt: "Adapter",
  },
  {
    serviceId: "x",
    pathName: "Legacy automation auto-post",
    nodes: [
      { node: "Automation", status: "ok", detail: "V1 automations" },
      { node: "Run", status: "ok", detail: "run-automation" },
      { node: "Job", status: "partial", detail: "legacy job table" },
      { node: "Step", status: "partial", detail: "post-generation hook" },
      {
        node: "StepInvoker",
        status: "ok",
        detail: "maybeAutoPostToXAfterAutomation",
      },
      {
        node: "AdapterRegistry",
        status: "n/a",
        detail: "direct service call",
      },
      {
        node: "Adapter",
        status: "ok",
        detail: "postTweetAutoForUser / createTweet",
      },
      {
        node: "ProviderAPI",
        status: "ok",
        detail: "X tweets API + existence confirm",
      },
      {
        node: "ExecutionResult",
        status: "ok",
        detail: "tweetId/text",
      },
      {
        node: "ExternalActionSave",
        status: "ok",
        detail: "xPostId/xPostUrl + history store",
      },
      {
        node: "CompletionEvidence",
        status: "partial",
        detail: "jobs/completion-evidence for sns_post",
      },
      {
        node: "Notification",
        status: "partial",
        detail: "emitters; detail richness varies",
      },
    ],
    brokenAt: null,
  },
  {
    serviceId: "google_drive",
    pathName: "Legacy deliverable upload",
    nodes: [
      { node: "Automation", status: "ok", detail: "V1/run after generation" },
      { node: "Run", status: "ok", detail: "run-automation" },
      { node: "Job", status: "partial", detail: "generation job" },
      { node: "Step", status: "partial", detail: "uploadDeliverablesAfterGeneration" },
      {
        node: "StepInvoker",
        status: "ok",
        detail: "deliverable-bridge → upload-service",
      },
      {
        node: "AdapterRegistry",
        status: "ok",
        detail: "upload-registry google_drive",
      },
      {
        node: "Adapter",
        status: "ok",
        detail: "googleDriveUploadProvider",
      },
      {
        node: "ProviderAPI",
        status: "ok",
        detail: "Drive multipart upload",
      },
      {
        node: "ExecutionResult",
        status: "ok",
        detail: "fileId + fileUrl",
      },
      {
        node: "ExternalActionSave",
        status: "ok",
        detail: "externalFileId/externalUrl",
      },
      {
        node: "CompletionEvidence",
        status: "partial",
        detail: "upload result fields; not V2 evidence schema",
      },
      {
        node: "Notification",
        status: "partial",
        detail: "depends on automation notification path",
      },
    ],
    brokenAt: null,
  },
  {
    serviceId: "dropbox",
    pathName: "V2 Automation dropbox step",
    nodes: [
      { node: "Automation", status: "ok", detail: "V2" },
      { node: "Run", status: "ok", detail: "V2" },
      { node: "Job", status: "ok", detail: "executor" },
      { node: "Step", status: "ok", detail: "type=dropbox" },
      { node: "StepInvoker", status: "partial", detail: "external gate" },
      {
        node: "AdapterRegistry",
        status: "ok",
        detail: "requiredAdapter=dropbox",
      },
      {
        node: "Adapter",
        status: "broken",
        detail: "unwired + memory tokens",
      },
      { node: "ProviderAPI", status: "broken", detail: "not reached via V2" },
      { node: "ExecutionResult", status: "broken", detail: "live_adapter_missing" },
      { node: "ExternalActionSave", status: "broken", detail: "n/a" },
      { node: "CompletionEvidence", status: "broken", detail: "n/a" },
      { node: "Notification", status: "partial", detail: "failure path" },
    ],
    brokenAt: "Adapter",
  },
  {
    serviceId: "wordpress",
    pathName: "V2 Automation wordpress step",
    nodes: [
      { node: "Automation", status: "ok", detail: "V2" },
      { node: "Run", status: "ok", detail: "V2" },
      { node: "Job", status: "ok", detail: "executor" },
      { node: "Step", status: "ok", detail: "type=wordpress" },
      { node: "StepInvoker", status: "partial", detail: "external gate" },
      {
        node: "AdapterRegistry",
        status: "ok",
        detail: "requiredAdapter=wordpress",
      },
      { node: "Adapter", status: "broken", detail: "unwired" },
      { node: "ProviderAPI", status: "broken", detail: "not reached via V2" },
      { node: "ExecutionResult", status: "broken", detail: "live_adapter_missing" },
      { node: "ExternalActionSave", status: "broken", detail: "n/a" },
      { node: "CompletionEvidence", status: "broken", detail: "n/a" },
      { node: "Notification", status: "partial", detail: "failure path" },
    ],
    brokenAt: "Adapter",
  },
  {
    serviceId: "google_calendar",
    pathName: "V2 Automation google_calendar step",
    nodes: [
      { node: "Automation", status: "ok", detail: "V2" },
      { node: "Run", status: "ok", detail: "V2" },
      { node: "Job", status: "ok", detail: "executor" },
      { node: "Step", status: "ok", detail: "type=google_calendar" },
      { node: "StepInvoker", status: "partial", detail: "external gate" },
      {
        node: "AdapterRegistry",
        status: "ok",
        detail: "requiredAdapter=google_calendar",
      },
      { node: "Adapter", status: "broken", detail: "unwired" },
      { node: "ProviderAPI", status: "broken", detail: "not reached via V2" },
      { node: "ExecutionResult", status: "broken", detail: "live_adapter_missing" },
      { node: "ExternalActionSave", status: "broken", detail: "n/a" },
      { node: "CompletionEvidence", status: "broken", detail: "n/a" },
      { node: "Notification", status: "partial", detail: "failure path" },
    ],
    brokenAt: "Adapter",
  },
] as const;
