/**
 * Live Adapter registry — single inventory for wired / unwired adapters.
 */

import "server-only";

import {
  EXTERNAL_LIVE_ADAPTERS,
} from "@/lib/automation-platform/execution/live-adapters/external";
import type {
  LiveAdapterDefinition,
  LiveAdapterId,
  LiveAdapterInvokeInput,
} from "@/lib/automation-platform/execution/live-adapters/types";
import { adapterFailure } from "@/lib/automation-platform/execution/live-adapters/types";
import { isLiveAdapterWired as isWired } from "@/lib/automation-platform/execution/live-adapters/wired-status";
import type { StepInvokeResult } from "@/lib/automation-platform/execution/step-invoker";

/** Internal engines — production paths already exist; marked wired for inventory. */
const INTERNAL_LIVE_ADAPTERS: readonly LiveAdapterDefinition[] = [
  {
    id: "atlas_deliverable_word",
    serviceLabel: "Word",
    wired: true,
    invoke: async () =>
      adapterFailure("Word", "step_not_implemented", "use_deliverable_step"),
  },
  {
    id: "atlas_deliverable_excel",
    serviceLabel: "Excel",
    wired: true,
    invoke: async () =>
      adapterFailure("Excel", "step_not_implemented", "use_deliverable_step"),
  },
  {
    id: "atlas_deliverable_pdf",
    serviceLabel: "PDF",
    wired: true,
    invoke: async () =>
      adapterFailure("PDF", "step_not_implemented", "use_deliverable_step"),
  },
  {
    id: "atlas_deliverable_powerpoint",
    serviceLabel: "PowerPoint",
    wired: true,
    invoke: async () =>
      adapterFailure(
        "PowerPoint",
        "step_not_implemented",
        "use_deliverable_step",
      ),
  },
  {
    id: "openai_vision",
    serviceLabel: "Vision",
    wired: true,
    invoke: async () =>
      adapterFailure("Vision", "step_not_implemented", "use_vision_step"),
  },
  {
    id: "openai_vision_ocr",
    serviceLabel: "OCR",
    wired: true,
    invoke: async () =>
      adapterFailure("OCR", "step_not_implemented", "use_ocr_step"),
  },
];

export const LIVE_ADAPTER_REGISTRY: readonly LiveAdapterDefinition[] = [
  ...INTERNAL_LIVE_ADAPTERS,
  ...EXTERNAL_LIVE_ADAPTERS,
];

const BY_ID = new Map(
  LIVE_ADAPTER_REGISTRY.map((entry) => [entry.id, entry] as const),
);

export function getLiveAdapter(
  id: string | null | undefined,
): LiveAdapterDefinition | undefined {
  if (!id) return undefined;
  return BY_ID.get(id as LiveAdapterId);
}

export function isLiveAdapterWired(adapterId: string | null): boolean {
  return isWired(adapterId);
}

export function listLiveAdapters(): Array<{
  id: LiveAdapterId;
  serviceLabel: string;
  wired: boolean;
}> {
  return LIVE_ADAPTER_REGISTRY.map((entry) => ({
    id: entry.id,
    serviceLabel: entry.serviceLabel,
    wired: entry.wired,
  }));
}

export async function invokeLiveAdapter(
  adapterId: string,
  input: LiveAdapterInvokeInput,
): Promise<StepInvokeResult> {
  const adapter = getLiveAdapter(adapterId);
  if (!adapter) {
    return adapterFailure(
      adapterId,
      "live_adapter_missing",
      `${adapterId}_live_adapter_not_registered`,
      { failedStage: "EXTERNAL_ADAPTER_RESOLUTION" },
    );
  }
  if (!adapter.wired) {
    return adapterFailure(
      adapter.serviceLabel,
      "live_adapter_missing",
      `${adapter.id}_live_adapter_not_wired`,
      { failedStage: "EXTERNAL_ADAPTER_RESOLUTION" },
    );
  }
  return adapter.invoke(input);
}

export const REQUIRED_LIVE_ADAPTER_IDS: readonly LiveAdapterId[] = [
  "atlas_deliverable_word",
  "atlas_deliverable_excel",
  "atlas_deliverable_pdf",
  "atlas_deliverable_powerpoint",
  "openai_vision",
  "openai_vision_ocr",
  "google_gmail",
  "google_drive",
  "dropbox",
  "x",
  "line",
  "slack",
  "discord",
  "notion",
] as const;
