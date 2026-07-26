#!/usr/bin/env node
/**
 * Real OpenAI Vision E2E (NOT mock).
 *
 * Loads scripts/fixtures/minervot-contact.png which contains ONLY:
 *   株式会社MINERVOT
 *   TEL 090-1234-5678
 * then calls OpenAI Responses API with input_image (Base64 data URL)
 * and asserts the model returns those values.
 *
 * Usage:
 *   OPENAI_API_KEY=... node scripts/vision-live-e2e.mjs
 * Optional:
 *   OPENAI_VISION_MODEL=gpt-5.5
 *   ATLAS_LIVE_E2E_OUT=/opt/cursor/artifacts/vision-live-e2e
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, "fixtures", "minervot-contact.png");

const COMPANY = "株式会社MINERVOT";
const PHONE = "090-1234-5678";
const USER_TEXT = "画像の会社名と電話番号を抽出してください。";
const DEFAULT_MODEL = process.env.OPENAI_VISION_MODEL?.trim() || "gpt-5.5";
const OUT_DIR =
  process.env.ATLAS_LIVE_E2E_OUT?.trim() ||
  "/opt/cursor/artifacts/vision-live-e2e";

function fail(message, extra) {
  const payload = {
    ok: false,
    error: message,
    ...(extra ? { extra } : {}),
    at: new Date().toISOString(),
  };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path.join(OUT_DIR, "result.json"), JSON.stringify(payload, null, 2));
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}

function normalizePhone(value) {
  return String(value ?? "").replace(/[^\d]/g, "");
}

function fieldPresent(fields, keys) {
  for (const key of keys) {
    const value = fields?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    fail(
      "OPENAI_API_KEY is not set in this environment. Real Vision E2E cannot run.",
    );
  }
  if (process.env.ATLAS_MOCK_LLM === "true") {
    fail("ATLAS_MOCK_LLM=true — refusing to run live E2E against mock path.");
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const png = readFileSync(FIXTURE);
  const imagePath = path.join(OUT_DIR, "minervot-contact.png");
  copyFileSync(FIXTURE, imagePath);

  const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
  if (!dataUrl.startsWith("data:image/png;base64,") || dataUrl.length < 64) {
    fail("Failed to build data URL from PNG bytes");
  }

  const model = DEFAULT_MODEL;
  const client = new OpenAI({ apiKey });

  const instructions = [
    "あなたは画像理解エンジンです。",
    "画像内の文字だけを根拠に JSON のみを返してください。",
    "推測で埋めないでください。読めない項目は null にしてください。",
    "Markdownや説明文は禁止。JSONオブジェクトのみ。",
  ].join("\n");

  const input = [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: [
            "【ユーザー依頼】",
            USER_TEXT,
            "",
            "【出力JSON】",
            JSON.stringify({
              companyName: "会社名またはnull",
              phone: "電話番号またはnull",
              extractedText: "画像内文字の転記",
              summary: "短い要約",
            }),
          ].join("\n"),
        },
        {
          type: "input_image",
          image_url: dataUrl,
          detail: "high",
        },
      ],
    },
  ];

  const requestMeta = {
    model,
    hasInputImage: input[0].content.some((p) => p.type === "input_image"),
    imageMime: "image/png",
    downloadedByteLength: png.length,
    base64Length: dataUrl.length,
    detail: "high",
    fixture: "scripts/fixtures/minervot-contact.png",
    promptContainsCompanyLiteral: USER_TEXT.includes(COMPANY),
    promptContainsPhoneLiteral: USER_TEXT.includes(PHONE),
  };
  writeFileSync(
    path.join(OUT_DIR, "request-meta.json"),
    JSON.stringify(requestMeta, null, 2),
  );

  if (requestMeta.promptContainsCompanyLiteral || requestMeta.promptContainsPhoneLiteral) {
    fail("Test prompt must not contain the expected literals (would invalidate vision proof).");
  }
  if (!requestMeta.hasInputImage) {
    fail("input_image missing from OpenAI request body");
  }

  console.log("[vision-live-e2e] calling OpenAI Responses API...", {
    model,
    downloadedByteLength: png.length,
    base64Length: dataUrl.length,
    hasInputImage: true,
  });

  let response;
  try {
    response = await client.responses.create({
      model,
      instructions,
      input,
    });
  } catch (error) {
    fail("OpenAI Responses API call failed", {
      name: error?.name ?? null,
      status: error?.status ?? null,
      code: error?.code ?? null,
      type: error?.type ?? null,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const rawText = response.output_text ?? "";
  writeFileSync(path.join(OUT_DIR, "raw-output.txt"), rawText);

  let parsed;
  try {
    const match = rawText.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match ? match[0] : rawText);
  } catch {
    fail("Model response was not valid JSON", {
      responseId: response.id ?? null,
      model: response.model ?? model,
      rawPreviewLength: rawText.length,
    });
  }

  const companyName =
    fieldPresent(parsed, ["companyName", "company", "会社名"]) ??
    (typeof parsed.fields === "object"
      ? fieldPresent(parsed.fields, ["companyName", "company", "会社名"])
      : null);
  const phone =
    fieldPresent(parsed, ["phone", "tel", "電話", "telephone"]) ??
    (typeof parsed.fields === "object"
      ? fieldPresent(parsed.fields, ["phone", "tel", "電話", "telephone"])
      : null);

  const companyOk = typeof companyName === "string" && companyName.includes("MINERVOT");
  const phoneOk = normalizePhone(phone) === normalizePhone(PHONE);

  const result = {
    ok: companyOk && phoneOk,
    mode: "openai_responses_live",
    mockDisabled: process.env.ATLAS_MOCK_LLM !== "true",
    responseId: response.id ?? null,
    model: response.model ?? model,
    usage: response.usage ?? null,
    downloadedByteLength: png.length,
    mimeType: "image/png",
    base64Length: dataUrl.length,
    inputImageIncluded: true,
    expected: { companyName: COMPANY, phone: PHONE },
    extracted: { companyName, phone },
    companyOk,
    phoneOk,
    extractedText: typeof parsed.extractedText === "string" ? parsed.extractedText : null,
    summary: typeof parsed.summary === "string" ? parsed.summary : null,
    imagePath,
    at: new Date().toISOString(),
  };

  writeFileSync(path.join(OUT_DIR, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exit(2);
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
