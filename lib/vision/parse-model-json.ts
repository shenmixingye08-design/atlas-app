import { visionModelPayloadSchema } from "@/lib/vision/schemas";
import { VisionError } from "@/lib/vision/types";

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new VisionError("json_parse_failed", "画像解析結果を取得できませんでした");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        // fall through
      }
    }
  }

  throw new VisionError(
    "json_parse_failed",
    "画像の内容を構造化できませんでした。再試行してください",
  );
}

export function parseVisionModelPayload(rawText: string) {
  const parsed = extractJsonObject(rawText);
  const result = visionModelPayloadSchema.safeParse(parsed);
  if (!result.success) {
    throw new VisionError(
      "json_parse_failed",
      "画像解析結果の形式が不正でした。再試行してください",
    );
  }
  return result.data;
}
