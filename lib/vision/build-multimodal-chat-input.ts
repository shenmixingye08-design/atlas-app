import "server-only";

import { toDataUrl } from "@/lib/attachments/preprocess";
import { readProcessedImageBytes } from "@/lib/attachments/store";
import { classifyImagePurposeFromText, recommendDetailLevel } from "@/lib/vision/classify";
import type { AtlasInputMessage } from "@/lib/openai";

/**
 * Build Responses API multimodal user message from text + owned attachments.
 * Loads private Storage/local bytes on the server and converts to Base64 data URLs.
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

  for (const id of input.attachmentIds) {
    const bytes = await readProcessedImageBytes(input.userId, id);
    if (!bytes) {
      missingIds.push(id);
      continue;
    }
    content.push({
      type: "input_image",
      image_url: toDataUrl(bytes.mimeType, bytes.buffer),
      detail,
    });
  }

  return {
    input: [{ role: "user", content }],
    missingIds,
  };
}
