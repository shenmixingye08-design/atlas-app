/**
 * Memory apply contracts — non-durable overlays over Personal / Work Memory.
 * Never invent a fourth durable store.
 */

import type { ResolvedInstruction } from "@/lib/automation-platform/types/instruction";
import type { MemoryUsageRecord } from "@/lib/automation-platform/types/run";
import type {
  ResolvedMemoryValue,
  RunMemoryLedger,
} from "@/lib/personal-memory/types";
import type { WordCompanyBrand } from "@/lib/deliverables/company-brand";
import type { WordTemplateId } from "@/lib/deliverables/word-templates";

export type MemoryApplyChannel =
  | "automation"
  | "vision"
  | "ocr"
  | "word"
  | "excel"
  | "pdf"
  | "powerpoint"
  | "notification"
  | "dashboard"
  | "regenerate"
  | "scheduler"
  | "orchestration"
  | "commander"
  | "prediction"
  | "workflow";

export type MemoryApplyMode = "on" | "off";

export type MemoryContentOverlay = {
  /** Prefixed / appended instruction block for generators / planner */
  injectionText: string;
  /** Writing style directives */
  writingStyle: string | null;
  /** Honorific / tone */
  tone: string | null;
  /** Forbidden phrases */
  forbiddenExpressions: string[];
  /** Signature block */
  signature: string | null;
  /** Company / contact lines */
  contactLines: string[];
  /** Industry / sales style notes */
  workStyleNotes: string[];
  /** OCR correction dictionary */
  ocrDictionary: Record<string, string>;
  /** Vision prior format hints */
  visionHints: string[];
};

export type MemoryDeliverableOverlay = {
  brand: WordCompanyBrand | null;
  templateId: WordTemplateId | null;
  companyName: string | null;
  author: string | null;
  footerNote: string | null;
  brandColorHex: string | null;
  defaultFont: string | null;
  excel: {
    headerColorArgb: string | null;
    currency: string | null;
    dateFormat: string | null;
    decimalPlaces: number | null;
    columnOrder: string[];
  };
  powerpoint: {
    brandColorHex: string | null;
    fontFace: string | null;
    titleAlign: "left" | "center" | "right" | null;
  };
  pdf: {
    brandColorHex: string | null;
    footerNote: string | null;
    marginPt: number | null;
  };
  memoryIdsUsed: string[];
  scopesUsed: string[];
};

export type MemoryQualityDiff = {
  memoryMode: MemoryApplyMode;
  beforeCharCount: number;
  afterCharCount: number;
  charDelta: number;
  addedTokens: string[];
  removedTokens: string[];
  overlapRatio: number;
  improvementRate: number;
  memoryHitCount: number;
  memoryMissCount: number;
  qualityScore: number;
  summary: string;
};

export type MemoryApplyDiagnostics = {
  channel: MemoryApplyChannel;
  applied: boolean;
  memoryEnabled: boolean;
  memoryIdsUsed: string[];
  scopesUsed: string[];
  injectionChars: number;
  tokenEstimate: number;
  quality: MemoryQualityDiff | null;
  notes: string[];
  at: string;
};

export type MemoryApplyResult = {
  injectionText: string;
  contentOverlay: MemoryContentOverlay;
  deliverableOverlay: MemoryDeliverableOverlay;
  memoryUsage: MemoryUsageRecord;
  ledger: RunMemoryLedger;
  resolvedInstruction: ResolvedInstruction | null;
  diagnostics: MemoryApplyDiagnostics;
};

export type MemoryApplyEvent = {
  id: string;
  userId: string;
  channel: MemoryApplyChannel;
  memoryMode: MemoryApplyMode;
  applied: boolean;
  memoryIdsUsed: string[];
  scopesUsed: string[];
  improvementRate: number;
  success: boolean;
  failureReason: string | null;
  at: string;
};

export type MemoryApplyMetricsSnapshot = {
  useCount: number;
  updateCount: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  averageImprovementRate: number;
  averageOverlapRatio: number;
  channelCoverage: Record<MemoryApplyChannel, number>;
  localStorageDependencyCount: number;
  auditedChannels: MemoryApplyChannel[];
  missingChannels: MemoryApplyChannel[];
  pass: boolean;
};

export type MemoryValuesFlat = Readonly<Record<string, unknown>>;

export type BuildOverlaysInput = {
  userId: string;
  values: readonly ResolvedMemoryValue[];
  injectionText?: string;
  tokenEstimate?: number;
  brandFallback?: WordCompanyBrand | null;
};
