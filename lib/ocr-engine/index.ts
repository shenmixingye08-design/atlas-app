export { scoreOcrAccuracy, redactOcrText } from "./accuracy";
export { buildOcrGroundTruthImage, OCR_GROUND_TRUTH_TOKENS } from "./fixture";
export { runOcrEngineEvaluation } from "./evaluate";
export { resolveActiveOcrPolicy } from "./policy";
export { probeOcrEngine } from "./ocr-engine-probe";
export { getOcrEngine, listOcrEngines } from "./engines";
export {
  OCR_ACCURACY_THRESHOLD,
  OCR_PROBE_OWNER,
  type OcrEngineId,
  type OcrExtractResult,
  type OcrEngineEvaluationRecord,
} from "./types";
