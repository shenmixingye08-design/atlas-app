import { writeFileSync } from "fs";

import { writePptxBuffer } from "../lib/pptx-secretary/build-pptx";
import { detectPptxIntent } from "../lib/pptx-secretary/detect-intent";
import { buildPresentationFromIntent } from "../lib/pptx-secretary/outlines";
import { validatePresentationModel } from "../lib/pptx-secretary/schema";

async function main() {
  const intent = detectPptxIntent("MINERVOTの営業提案資料を10分で作って");
  const model = buildPresentationFromIntent(intent, {
    brand: {
      companyName: "MINERVOT",
      primaryColor: "0F3D68",
      accentColor: "C45C26",
      footer: "MINERVOT",
    },
  });
  const validation = validatePresentationModel(model);
  if (!validation.ok) {
    console.error(validation.errors);
    process.exit(1);
  }
  const buffer = await writePptxBuffer(validation.value);
  writeFileSync("/opt/cursor/artifacts/sample-minervot-sales.pptx", buffer);
  console.log(
    JSON.stringify(
      {
        slides: validation.value.slides.length,
        bytes: buffer.byteLength,
        theme: validation.value.theme.style,
        title: validation.value.presentation_title,
        notes: validation.value.slides.filter((s) => s.speaker_notes).length,
        magic: buffer.subarray(0, 2).toString("utf8"),
      },
      null,
      2,
    ),
  );
}

void main();
