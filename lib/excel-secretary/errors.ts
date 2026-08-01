import type { ExcelPipelineStage } from "./types";

/** Staged Excel Secretary failure with pipeline location. */
export class ExcelSecretaryError extends Error {
  readonly stage: ExcelPipelineStage;
  readonly code: string;
  readonly retriable: boolean;

  constructor(
    stage: ExcelPipelineStage,
    code: string,
    message: string,
    retriable = true,
  ) {
    super(message);
    this.name = "ExcelSecretaryError";
    this.stage = stage;
    this.code = code;
    this.retriable = retriable;
  }
}
