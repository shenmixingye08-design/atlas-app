import "server-only";

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { loadSharp } from "@/lib/images/load-sharp";

import { detectImageMimeFromBytes } from "@/lib/vision/image-magic";

export type WireImageCapture = {
  probeDir: string;
  /** Exact bytes decoded from the JSON that will be POSTed to OpenAI. */
  imageFromSerializedBodyPath: string | null;
  structurePath: string;
  mimeFromHeader: string | null;
  mimeFromMagic: string | null;
  byteLength: number | null;
  width: number | null;
  height: number | null;
  headHex32: string | null;
  openable: boolean;
  imageUrlIsString: boolean;
  contentPartKeys: string[];
  transport: "data_url" | "file_id" | "none";
  fileId: string | null;
  error: string | null;
};

function defaultProbeRoot(): string {
  return (
    process.env.VISION_WIRE_CAPTURE_DIR?.trim() ||
    "/tmp/atlas-vision-wire-captures"
  );
}

/**
 * Capture the image payload **after JSON serialization** (what the SDK/HTTP body
 * actually contains), not the in-memory Buffer before stringify.
 *
 * This is the only way to prove OpenAI received the same bytes we think we sent.
 */
export async function captureVisionWirePayload(input: {
  diagnosticId?: string | null;
  requestBody: unknown;
}): Promise<WireImageCapture> {
  const probeDir = join(
    defaultProbeRoot(),
    input.diagnosticId?.replace(/[^a-zA-Z0-9_-]/g, "") || "nodiag",
    String(Date.now()),
  );
  mkdirSync(probeDir, { recursive: true });

  const result: WireImageCapture = {
    probeDir,
    imageFromSerializedBodyPath: null,
    structurePath: join(probeDir, "request-structure.json"),
    mimeFromHeader: null,
    mimeFromMagic: null,
    byteLength: null,
    width: null,
    height: null,
    headHex32: null,
    openable: false,
    imageUrlIsString: false,
    contentPartKeys: [],
    transport: "none",
    fileId: null,
    error: null,
  };

  // Force a real JSON round-trip — same as the OpenAI SDK HTTP body.
  let parsed: unknown;
  try {
    parsed = JSON.parse(JSON.stringify(input.requestBody));
  } catch (error) {
    result.error =
      error instanceof Error ? error.message : "json_serialize_failed";
    writeFileSync(
      result.structurePath,
      JSON.stringify({ error: result.error }, null, 2),
    );
    return result;
  }

  const content = extractUserContent(parsed);
  const imagePart = content?.find(
    (part) =>
      part &&
      typeof part === "object" &&
      (part as { type?: string }).type === "input_image",
  ) as
    | {
        type: string;
        image_url?: unknown;
        file_id?: unknown;
        detail?: unknown;
      }
    | undefined;

  result.contentPartKeys = imagePart ? Object.keys(imagePart) : [];
  result.imageUrlIsString = typeof imagePart?.image_url === "string";
  result.fileId =
    typeof imagePart?.file_id === "string" ? imagePart.file_id : null;
  if (result.fileId) result.transport = "file_id";

  const structure = {
    topLevelKeys:
      parsed && typeof parsed === "object"
        ? Object.keys(parsed as object)
        : [],
    contentPartSummaries: (content ?? []).map((part) => {
      if (!part || typeof part !== "object") return { type: typeof part };
      const row = part as Record<string, unknown>;
      const imageUrl = row.image_url;
      return {
        type: row.type ?? null,
        keys: Object.keys(row),
        detail: row.detail ?? null,
        file_id: typeof row.file_id === "string" ? row.file_id : null,
        image_url_typeof: typeof imageUrl,
        image_url_is_object:
          imageUrl !== null && typeof imageUrl === "object",
        image_url_prefix:
          typeof imageUrl === "string" ? imageUrl.slice(0, 32) : null,
      };
    }),
    matchesOfficialResponsesApi: Boolean(
      imagePart &&
        imagePart.type === "input_image" &&
        (typeof imagePart.image_url === "string" ||
          typeof imagePart.file_id === "string") &&
        !(
          imagePart.image_url !== null &&
          typeof imagePart.image_url === "object"
        ),
    ),
  };
  writeFileSync(result.structurePath, JSON.stringify(structure, null, 2));

  if (typeof imagePart?.image_url === "string") {
    result.transport = "data_url";
    const dataUrl = imagePart.image_url;
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]*)$/i.exec(
      dataUrl,
    );
    if (!match) {
      result.error = "data_url_header_invalid_in_serialized_body";
      return result;
    }
    result.mimeFromHeader = match[1]!.toLowerCase();
    const base64 = match[2]!.replace(/\s+/g, "");
    const buffer = Buffer.from(base64, "base64");
    result.byteLength = buffer.length;
    result.headHex32 = buffer.subarray(0, 32).toString("hex");
    result.mimeFromMagic = detectImageMimeFromBytes(buffer);

    const ext =
      result.mimeFromMagic === "image/png"
        ? "png"
        : result.mimeFromMagic === "image/webp"
          ? "webp"
          : "jpg";
    const imagePath = join(probeDir, `from-serialized-body.${ext}`);
    writeFileSync(imagePath, buffer);
    result.imageFromSerializedBodyPath = imagePath;

    try {
      const fromDisk = readFileSync(imagePath);
      const sharp = await loadSharp();
      const meta = await sharp(fromDisk, { failOn: "error" }).metadata();
      result.width = meta.width ?? null;
      result.height = meta.height ?? null;
      result.openable = Boolean(meta.width && meta.height && meta.format);
    } catch (error) {
      result.openable = false;
      result.error =
        error instanceof Error ? error.message.slice(0, 200) : "not_openable";
    }
  }

  // Also keep a redacted request dump (no full base64).
  const redacted = redactDeep(parsed);
  writeFileSync(
    join(probeDir, "request-redacted.json"),
    JSON.stringify(redacted, null, 2),
  );

  console.info("[vision] wire_image_capture", {
    diagnosticId: input.diagnosticId ?? null,
    probeDir: result.probeDir,
    transport: result.transport,
    mimeFromHeader: result.mimeFromHeader,
    mimeFromMagic: result.mimeFromMagic,
    byteLength: result.byteLength,
    width: result.width,
    height: result.height,
    headHex32: result.headHex32,
    openable: result.openable,
    imageUrlIsString: result.imageUrlIsString,
    fileId: result.fileId,
    imagePath: result.imageFromSerializedBodyPath,
    error: result.error,
  });

  return result;
}

function extractUserContent(body: unknown): unknown[] | null {
  if (!body || typeof body !== "object") return null;
  const input = (body as { input?: unknown }).input;
  if (!Array.isArray(input) || input.length === 0) return null;
  const first = input[0];
  if (!first || typeof first !== "object") return null;
  const content = (first as { content?: unknown }).content;
  return Array.isArray(content) ? content : null;
}

function redactDeep(value: unknown): unknown {
  if (typeof value === "string") {
    if (value.startsWith("data:image")) {
      const comma = value.indexOf(",");
      const header = comma >= 0 ? value.slice(0, comma) : "data:image";
      const len = comma >= 0 ? value.length - comma - 1 : 0;
      return `${header},[base64_redacted len=${len}]`;
    }
    return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  }
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactDeep(v);
    }
    return out;
  }
  return value;
}

/** Tiny known-good 1×1 JPEG (hardcoded) for API structure canary. */
export const HARDCODED_VALID_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//Z";

export function hardcodedValidJpegBuffer(): Buffer {
  return Buffer.from(HARDCODED_VALID_JPEG_BASE64, "base64");
}

export function hardcodedValidJpegDataUrl(): string {
  return `data:image/jpeg;base64,${HARDCODED_VALID_JPEG_BASE64}`;
}
