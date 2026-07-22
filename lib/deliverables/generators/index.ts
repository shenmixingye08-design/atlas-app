import type { DeliverableFormat, DeliverableGenerator } from "../types";

import { CsvDeliverableGenerator } from "./csv-generator";
import { DocxDeliverableGenerator } from "./docx-generator";
import { MarkdownDeliverableGenerator } from "./markdown-generator";
import { PdfDeliverableGenerator } from "./pdf-generator";
import { PlainTextDeliverableGenerator } from "./plain-text-generator";
import { PptxDeliverableGenerator } from "./pptx-generator";
import { XlsxDeliverableGenerator } from "./xlsx-generator";

export { createDeliverableFile, formatGeneratedDate } from "./shared";
export { MarkdownDeliverableGenerator } from "./markdown-generator";
export { PlainTextDeliverableGenerator } from "./plain-text-generator";
export { PdfDeliverableGenerator } from "./pdf-generator";
export {
  DocxDeliverableGenerator,
  DocxPlaceholderGenerator,
} from "./docx-generator";
export {
  PptxDeliverableGenerator,
  PptxPlaceholderGenerator,
} from "./pptx-generator";
export { XlsxDeliverableGenerator } from "./xlsx-generator";
export { CsvDeliverableGenerator } from "./csv-generator";

export const defaultDeliverableGenerators: readonly DeliverableGenerator[] = [
  new PlainTextDeliverableGenerator(),
  new MarkdownDeliverableGenerator(),
  new CsvDeliverableGenerator(),
  new PdfDeliverableGenerator(),
  new DocxDeliverableGenerator(),
  new PptxDeliverableGenerator(),
  new XlsxDeliverableGenerator(),
];

const generatorMap = new Map<DeliverableFormat, DeliverableGenerator>(
  defaultDeliverableGenerators.map((generator) => [generator.format, generator]),
);

export function getDeliverableGenerator(
  format: DeliverableFormat,
): DeliverableGenerator | undefined {
  return generatorMap.get(format);
}
