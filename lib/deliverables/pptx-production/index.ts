export { PPTX_PRODUCTION_FEATURE_EVALUATION } from "./feature-evaluation";
export {
  inspectPptxProduction,
  assertPptxProductionOrThrow,
  verifyPptxProductionStructure,
  type PptxQualityReport,
} from "./pptx-inspect";
export {
  normalizeJapaneseBusinessText,
  fitFontSize,
} from "./japanese-normalize";
export { verifyWordPptxParity } from "./word-pptx-parity";
export { verifyExcelPptxParity } from "./excel-pptx-parity";
export { verifyPptxPdfParity } from "./pptx-pdf-parity";
export { buildPptxProductionCases } from "./cases";
export { runPptxProductionSuite } from "./run-suite";
