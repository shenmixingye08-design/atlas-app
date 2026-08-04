import "server-only";

import { readProcessedImageBytes } from "@/lib/attachments/store";
import { classifyImagePurposeFromText, recommendDetailLevel } from "@/lib/vision/classify";
import { normalizeImageForOpenAi } from "@/lib/vision/normalize-for-openai";
import { validateOpenAiImageDataUrl } from "@/lib/vision/validate-openai-image-payload";
import type { AtlasInputMessage } from "@/lib/openai";

/**
 * Build Responses API multimodal user message from text + owned attachments.
 * Loads private Storage/local bytes on the server, re-encodes, validates magic bytes,
 * then converts to Base64 data URLs. Never trusts DB MIME for the OpenAI payload.
 */
export async function buildMultimodalChatInput(input: {
  userId: string;
  text: string;
  attachmentIds: string[];
  ecoMode?: boolean;
}): Promise<{ input: AtlasInputMessage[]; missingIds: string[] }> {
  const missingIds: string[] = [];
  const content: AtlasInputMessage["content"] = [
    {
      type: "input_text",
      text: input.text.trim(),
    },
  ];

  const hint = classifyImagePurposeFromText(input.text, "unknown");
  const detail = recommendDetailLevel({
    detectedType: hint,
    userText: input.text,
    imageCount: input.attachmentIds.length,
    ecoMode: input.ecoMode,
  });
  const openAiDetail = detail === "low" ? "low" : "high";

  for (const id of input.attachmentIds) {
    const bytes = await readProcessedImageBytes(input.userId, id);
    if (!bytes) {
      missingIds.push(id);
      continue;
    }
    // Re-encode + magic-byte gate — same path as vision analyze.
    const normalized = await normalizeImageForOpenAi({
      buffer: bytes.buffer,
      profile: input.ecoMode ? "compact" : "standard",
    });
    const validated = await validateOpenAiImageDataUrl({
      dataUrl: normalized.dataUrl,
    });
    content.push({
      type: "input_image",
      image_url: validated.dataUrl,
      detail: openAiDetail,
    });
  }

  return {
    input: [{ role: "user", content }],
    missingIds,
  };
}
