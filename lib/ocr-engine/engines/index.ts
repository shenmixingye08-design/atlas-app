import type { OcrEngine, OcrEngineId } from "../types";
import { documentAiOcrEngine } from "./document-ai";
import { openaiVisionOcrEngine } from "./openai-vision-ocr";

const ENGINES: Record<OcrEngineId, OcrEngine> = {
  openai_vision_ocr: openaiVisionOcrEngine,
  document_ai: documentAiOcrEngine,
};

export function getOcrEngine(id: OcrEngineId): OcrEngine {
  return ENGINES[id];
}

export function listOcrEngines(): OcrEngine[] {
  return Object.values(ENGINES);
}

export { openaiVisionOcrEngine, documentAiOcrEngine };
