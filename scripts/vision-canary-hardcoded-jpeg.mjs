#!/usr/bin/env node
/**
 * A/B canary against live OpenAI Responses API.
 *
 * A) Hardcoded known-good 1×1 JPEG (proves request structure)
 * B) sharp-normalized phone-like JPEG (proves preprocess path)
 *
 * If A succeeds and B fails → preprocess/encoding is the cause.
 * If A fails → API request structure / model / key is the cause.
 *
 *   OPENAI_API_KEY=... node scripts/vision-canary-hardcoded-jpeg.mjs
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import sharp from "sharp";

const OUT =
  process.env.ATLAS_LIVE_E2E_OUT?.trim() ||
  "/opt/cursor/artifacts/vision-canary";
const MODEL = process.env.OPENAI_VISION_MODEL?.trim() || "gpt-5.5";

const HARDCODED_JPEG_B64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//Z";

function saveDecoded(dataUrl, filePath) {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const buf = Buffer.from(b64, "base64");
  writeFileSync(filePath, buf);
  return buf;
}

async function callOnce(client, label, imagePart) {
  const body = {
    model: MODEL,
    max_output_tokens: 128,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: "Reply with exactly: OK" },
          imagePart,
        ],
      },
    ],
  };
  writeFileSync(
    path.join(OUT, `${label}-request-structure.json`),
    JSON.stringify(
      {
        ...body,
        input: [
          {
            role: "user",
            content: body.input[0].content.map((p) => {
              if (p.type !== "input_image") return p;
              if (typeof p.image_url === "string") {
                return {
                  type: p.type,
                  detail: p.detail,
                  image_url: `${p.image_url.slice(0, 30)}…[redacted len=${p.image_url.length}]`,
                  keys: Object.keys(p),
                };
              }
              return { ...p, keys: Object.keys(p) };
            }),
          },
        ],
      },
      null,
      2,
    ),
  );

  try {
    const response = await client.responses.create(body);
    return {
      ok: true,
      label,
      status: response.status,
      id: response.id,
      output_text: response.output_text?.slice(0, 200) ?? "",
    };
  } catch (error) {
    const err = error?.error ?? error;
    return {
      ok: false,
      label,
      status: error?.status ?? null,
      type: err?.type ?? error?.name ?? null,
      code: err?.code ?? null,
      message: err?.message ?? error?.message ?? String(error),
      request_id: error?.requestID ?? error?.headers?.["x-request-id"] ?? null,
      param: err?.param ?? null,
    };
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    const payload = {
      ok: false,
      error: "OPENAI_API_KEY missing — cannot run live canary",
      note: "PR #55 is still unmerged on main; production still uses toDataUrl(dbMime).",
    };
    writeFileSync(path.join(OUT, "result.json"), JSON.stringify(payload, null, 2));
    console.error(JSON.stringify(payload, null, 2));
    process.exit(2);
  }

  const client = new OpenAI({ apiKey, maxRetries: 0 });

  // A: hardcoded
  const hardcodedUrl = `data:image/jpeg;base64,${HARDCODED_JPEG_B64}`;
  const hardcodedBuf = saveDecoded(
    hardcodedUrl,
    path.join(OUT, "A-hardcoded.jpg"),
  );
  const hardcodedMeta = await sharp(hardcodedBuf).metadata();

  // B: normalized phone-like
  const phone = await sharp({
    create: {
      width: 1200,
      height: 1600,
      channels: 3,
      background: { r: 40, g: 80, b: 120 },
    },
  })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
  const normalized = await sharp(phone)
    .rotate()
    .toColourspace("srgb")
    .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
  const normalizedUrl = `data:image/jpeg;base64,${normalized.toString("base64")}`;
  saveDecoded(normalizedUrl, path.join(OUT, "B-normalized.jpg"));
  // Re-open from disk (Windows/Mac/Android parity check via sharp)
  const fromDisk = readFileSync(path.join(OUT, "B-normalized.jpg"));
  const diskMeta = await sharp(fromDisk, { failOn: "error" }).metadata();

  // C: Files API file_id with normalized bytes
  let fileIdResult = null;
  try {
    const { toFile } = await import("openai");
    const file = await client.files.create({
      file: await toFile(normalized, "canary-b.jpg", { type: "image/jpeg" }),
      purpose: "vision",
    });
    fileIdResult = await callOnce(client, "C-file_id", {
      type: "input_image",
      file_id: file.id,
      detail: "high",
    });
    try {
      await client.files.delete(file.id);
    } catch {
      /* ignore */
    }
  } catch (error) {
    fileIdResult = {
      ok: false,
      label: "C-file_id",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  const a = await callOnce(client, "A-hardcoded-data_url", {
    type: "input_image",
    image_url: hardcodedUrl,
    detail: "high",
  });
  const b = await callOnce(client, "B-normalized-data_url", {
    type: "input_image",
    image_url: normalizedUrl,
    detail: "high",
  });

  const verdict = {
    ok: a.ok && b.ok && fileIdResult?.ok,
    model: MODEL,
    savedFiles: {
      hardcoded: path.join(OUT, "A-hardcoded.jpg"),
      normalized: path.join(OUT, "B-normalized.jpg"),
      hardcodedMeta: {
        format: hardcodedMeta.format,
        w: hardcodedMeta.width,
        h: hardcodedMeta.height,
      },
      normalizedMeta: {
        format: diskMeta.format,
        w: diskMeta.width,
        h: diskMeta.height,
        headHex32: fromDisk.subarray(0, 32).toString("hex"),
      },
    },
    results: { A: a, B: b, C: fileIdResult },
    interpretation: !a.ok
      ? "A failed → request structure / model / account (not user image bytes)"
      : !b.ok
        ? "A ok, B failed → preprocess/encoding of user-like JPEG"
        : !fileIdResult?.ok
          ? "data URL ok, file_id failed → Files API path issue"
          : "All transports succeeded — investigate deploy (is PR #55 on the failing env?)",
  };

  writeFileSync(path.join(OUT, "result.json"), JSON.stringify(verdict, null, 2));
  console.log(JSON.stringify(verdict, null, 2));
  process.exit(verdict.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
