import type {
  VisionAnalysisResult,
  VisionDetailLevel,
  VisionDetectedType,
} from "@/lib/vision/types";

export type VisionAnalyzeImageInput = {
  userId: string;
  attachmentId: string;
  /** data URL (legacy) — prefer imageBytes + re-normalize in provider */
  imageUrl: string;
  /** Raw processed/original bytes for pre-send normalization (preferred). */
  imageBytes?: Buffer;
  userText: string;
  hintType: VisionDetectedType;
  detail: VisionDetailLevel;
  pageIndex: number;
  pageCount: number;
  jobId?: string | null;
  diagnosticId?: string | null;
  /** Storage object path for preflight logs (never signed URL secrets). */
  storagePath?: string | null;
};

export type VisionProviderResult = {
  result: VisionAnalysisResult;
  model: string;
  inputTokens: number;
  outputTokens: number;
  rawText: string;
};

/**
 * Pluggable vision backend. Default: OpenAI Responses API multimodal.
 * Future: Document AI / Azure OCR adapters can implement this.
 */
export interface VisionProvider {
  readonly id: string;
  analyzeImage(input: VisionAnalyzeImageInput): Promise<VisionProviderResult>;
}
