import type { DeliverableFormat } from "@/lib/deliverables/types";

export const DELIVERABLE_BATCH_COUNTS = [3, 5, 7, 10, 12] as const;
export type DeliverableBatchCount = (typeof DELIVERABLE_BATCH_COUNTS)[number];

export const DELIVERABLE_BATCH_LIVE_FORMATS = [
  "txt",
  "docx",
  "xlsx",
  "pdf",
  "pptx",
] as const satisfies readonly DeliverableFormat[];

export type DeliverableBatchFormat =
  (typeof DELIVERABLE_BATCH_LIVE_FORMATS)[number];

export const DELIVERABLE_BATCH_INPUT_TYPES = [
  "ai_themes",
  "line_list",
  "spreadsheet",
  "attachments",
] as const;

export type DeliverableBatchInputType =
  (typeof DELIVERABLE_BATCH_INPUT_TYPES)[number];

export const DELIVERABLE_BATCH_STATUSES = [
  "draft",
  "generating_sample",
  "sample_ready",
  "generating",
  "partially_failed",
  "ready",
  "completed",
  "cancelled",
] as const;

export type DeliverableBatchStatus =
  (typeof DELIVERABLE_BATCH_STATUSES)[number];

export const DELIVERABLE_BATCH_ITEM_STATUSES = [
  "pending",
  "generating",
  "ready",
  "approved",
  "failed",
  "cancelled",
] as const;

export type DeliverableBatchItemStatus =
  (typeof DELIVERABLE_BATCH_ITEM_STATUSES)[number];

export type DeliverableBatchCommon = {
  purpose: string;
  audience: string;
  tone: string;
  length: string;
  structure: string;
  template: string;
  mustInclude: string;
  forbidden: string;
  fileNameRule: string;
};

export type DeliverableBatchItemInput = {
  title: string;
  theme: string;
  instruction: string;
  forbidden?: string;
  fileName?: string;
  audience?: string;
  include?: string;
  attachmentId?: string;
  attachmentName?: string;
};

export type DeliverableBatchItem = {
  id: string;
  batchId: string;
  userId: string;
  order: number;
  inputType: DeliverableBatchInputType;
  inputReference: string | null;
  title: string;
  theme: string;
  individualInstruction: string;
  forbidden: string;
  fileName: string | null;
  outputFormat: DeliverableBatchFormat;
  outputArtifactId: string | null;
  workJobId: string | null;
  sourceContent: string | null;
  status: DeliverableBatchItemStatus;
  retryCount: number;
  error: string | null;
  edited: boolean;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DeliverableBatch = {
  id: string;
  userId: string;
  name: string;
  inputType: DeliverableBatchInputType;
  common: DeliverableBatchCommon;
  format: DeliverableBatchFormat;
  requestedCount: number;
  status: DeliverableBatchStatus;
  sampleItemId: string | null;
  sampleApproved: boolean;
  sampleStyleNote: string | null;
  styleCandidate: string | null;
  duplicateWarnings: string[];
  cancelled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DeliverableBatchWithItems = {
  batch: DeliverableBatch;
  items: DeliverableBatchItem[];
};

export type CreateDeliverableBatchInput = {
  name?: string;
  inputType: DeliverableBatchInputType;
  common: DeliverableBatchCommon;
  format: DeliverableBatchFormat;
  requestedCount: number;
  sharedInstruction: string;
  lines?: string[];
  spreadsheetRows?: Array<Record<string, string>>;
  columnMap?: Record<string, string>;
  attachments?: Array<{ id: string; name: string; extractedText?: string }>;
};
