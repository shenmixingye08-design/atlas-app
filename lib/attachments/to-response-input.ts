import "server-only";

import type {
  ResponseInput,
  ResponseInputContent,
  ResponseInputImage,
} from "openai/resources/responses/responses";

import {
  readAvailableImageAttachments,
  resolveImageDetailLevel,
} from "./metadata";
import { getStoredAttachment, storedAttachmentToDataUrl } from "./store";
import type { AttachmentMetadataItem, ImageDetailLevel } from "./types";

function resolveImageUrl(item: AttachmentMetadataItem): string | null {
  if (item.storageId) {
    const stored = getStoredAttachment(item.storageId);
    if (stored) return storedAttachmentToDataUrl(stored);
  }
  if (item.imageUrl && item.imageUrl.trim()) {
    return item.imageUrl.trim();
  }
  return null;
}

export function buildInputImageParts(
  metadata: Readonly<Record<string, unknown>> | undefined,
): ResponseInputImage[] {
  const detail = resolveImageDetailLevel(metadata);
  const images = readAvailableImageAttachments(metadata);
  const parts: ResponseInputImage[] = [];

  for (const item of images) {
    const imageUrl = resolveImageUrl(item);
    if (!imageUrl) continue;
    parts.push({
      type: "input_image",
      image_url: imageUrl,
      detail,
    });
  }

  return parts;
}

/**
 * Builds Responses API `input`: plain string when no images, otherwise a
 * multimodal user message with `input_text` + `input_image` parts.
 */
export function buildMultimodalResponseInput(
  text: string,
  metadata: Readonly<Record<string, unknown>> | undefined,
): string | ResponseInput {
  const imageParts = buildInputImageParts(metadata);
  if (imageParts.length === 0) {
    return text;
  }

  const content: ResponseInputContent[] = [
    { type: "input_text", text },
    ...imageParts,
  ];

  return [
    {
      type: "message",
      role: "user",
      content,
    },
  ];
}

/** Flatten multimodal input to text for billing / mock LLM routing. */
export function summarizeInputAsText(
  input: string | ResponseInput,
): string {
  if (typeof input === "string") return input;

  const chunks: string[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    if (!("content" in item)) continue;
    const content = (item as { content?: unknown }).content;
    if (typeof content === "string") {
      chunks.push(content);
      continue;
    }
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const record = part as Record<string, unknown>;
      if (record.type === "input_text" && typeof record.text === "string") {
        chunks.push(record.text);
      } else if (record.type === "input_image") {
        chunks.push("[attached image]");
      }
    }
  }
  return chunks.join("\n");
}

export type { ImageDetailLevel };
