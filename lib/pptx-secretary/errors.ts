import type { PptxPipelineStage } from "./types";
import type { PptxUserErrorCode } from "./job-phase";

export class PptxSecretaryError extends Error {
  readonly stage: PptxPipelineStage;
  readonly code: PptxUserErrorCode;
  readonly retriable: boolean;
  readonly diagnosticId: string;

  constructor(params: {
    stage: PptxPipelineStage;
    code: PptxUserErrorCode;
    message: string;
    retriable?: boolean;
    diagnosticId?: string;
  }) {
    super(params.message);
    this.name = "PptxSecretaryError";
    this.stage = params.stage;
    this.code = params.code;
    this.retriable = params.retriable ?? false;
    this.diagnosticId =
      params.diagnosticId ??
      `pptx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}
