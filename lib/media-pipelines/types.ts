/** Extensible image kinds — each maps to a dedicated pipeline. */
export const MEDIA_KINDS = [
  "receipt",
  "invoice",
  "business_card",
  "contract",
  "sales_material",
  "whiteboard",
  "other",
] as const;

export type MediaKind = (typeof MEDIA_KINDS)[number];

export type MediaImageInput = {
  id: string;
  filename: string;
  mimeType: string;
  /** Raw bytes */
  bytes: Buffer;
  /** data URL for vision APIs */
  dataUrl: string;
  contentHash: string;
};

export type MediaClassification = {
  kind: MediaKind;
  confidence: number;
  reason: string;
  model?: string;
};

export type MediaPipelineId =
  | "receipt"
  | "invoice"
  | "business_card"
  | "contract"
  | "sales_material"
  | "whiteboard"
  | "unsupported";

export type MediaPipelineRoute = {
  pipelineId: MediaPipelineId;
  classification: MediaClassification;
  /** When true, do NOT send into Commander / deliverable orchestration. */
  bypassOrchestration: boolean;
};
