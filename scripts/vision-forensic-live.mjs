#!/usr/bin/env node
/**
 * Forensic live split test for OpenAI vision 400 invalid image.
 *
 * Requires: OPENAI_API_KEY
 *
 * Steps:
 * 1) Load testdata/vision/known-good-64.jpg (no conversion)
 * 2) Save decoded artifacts + sharp.metadata / reopen
 * 3) Inspect data URL integrity (double base64, whitespace, etc.)
 * 4) Call Responses API via OpenAI SDK
 * 5) Call same payload via raw HTTPS (curl-equivalent)
 * 6) Write structure logs (secrets/base64 redacted)
 *
 * Usage:
 *   OPENAI_API_KEY=... node scripts/vision-forensic-live.mjs
 * Optional:
 *   OPENAI_VISION_MODEL=gpt-5.5
 *   ATLAS_LIVE_E2E_OUT=/opt/cursor/artifacts/vision-forensic
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT =
  process.env.ATLAS_LIVE_E2E_OUT?.trim() ||
  "/opt/cursor/artifacts/vision-forensic";
const MODEL = process.env.OPENAI_VISION_MODEL?.trim() || "gpt-5.5";
const FIXTURE = path.join(ROOT, "testdata/vision/known-good-64.jpg");

function inspectDataUrlIntegrity(dataUrl) {
  const issues = [];
  const hasDataPrefixDuplicate =
    (dataUrl.match(/data:image\//gi) ?? []).length > 1 ||
    dataUrl.includes("base64,data:image");
  if (hasDataPrefixDuplicate) issues.push("duplicate_data_prefix");
  if (/%2[fF]|%2[bB]|%3[dD]|data%3Aimage/.test(dataUrl)) issues.push("url_encoded");
  const comma = dataUrl.indexOf(",");
  const header = comma >= 0 ? dataUrl.slice(0, comma) : "";
  const payload = comma >= 0 ? dataUrl.slice(comma + 1) : "";
  if (!/^data:image\/(jpeg|png);base64$/i.test(header.trim())) issues.push("bad_header");
  if (/[\s]/.test(payload)) issues.push("whitespace_in_base64");
  if (/["'<>\\]/.test(payload)) issues.push("quotes_in_base64");
  if (payload.includes(" ") && !payload.includes("+")) issues.push("plus_became_space");
  if (payload.length < 32) issues.push("base64_truncated");
  const cleaned = payload.replace(/\s+/g, "");
  const decoded = Buffer.from(cleaned, "base64");
  const asUtf8 = decoded.toString("utf8");
  if (asUtf8.startsWith("data:image") || asUtf8.startsWith("/9j/")) {
    issues.push("double_base64");
  }
  return {
    ok: issues.length === 0,
    issues,
    header,
    base64Length: cleaned.length,
    decodedByteLength: decoded.length,
    headHex32: decoded.subarray(0, 32).toString("hex"),
  };
}

async function openabilityReport(buffer, label) {
  const filePath = path.join(OUT, `${label}.bin`);
  writeFileSync(filePath, buffer);
  const jpegPath = path.join(OUT, `${label}.jpg`);
  const pngPath = path.join(OUT, `${label}.png`);
  let meta;
  try {
    meta = await sharp(buffer, { failOn: "error" }).metadata();
  } catch (error) {
    return {
      label,
      openable: false,
      error: error instanceof Error ? error.message : String(error),
      filePath,
      headHex32: buffer.subarray(0, 32).toString("hex"),
      byteLength: buffer.length,
    };
  }
  await sharp(buffer).jpeg({ quality: 90 }).toFile(jpegPath);
  await sharp(buffer).png().toFile(pngPath);
  const reopened = await sharp(readFileSync(jpegPath), { failOn: "error" }).metadata();
  // file(1)-equivalent via magic
  const magic =
    buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
      ? "JPEG"
      : buffer[0] === 0x89 && buffer.toString("ascii", 1, 4) === "PNG"
        ? "PNG"
        : "UNKNOWN";
  return {
    label,
    openable: true,
    magic,
    format: meta.format,
    width: meta.width,
    height: meta.height,
    byteLength: buffer.length,
    headHex32: buffer.subarray(0, 32).toString("hex"),
    sha256: createHash("sha256").update(buffer).digest("hex"),
    filePath,
    resavedJpeg: jpegPath,
    resavedPng: pngPath,
    reopened: { format: reopened.format, width: reopened.width, height: reopened.height },
  };
}

function redactBody(body) {
  const clone = JSON.parse(JSON.stringify(body));
  const walk = (obj) => {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) return obj.forEach(walk);
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "string" && v.startsWith("data:image")) {
        obj[k] = `${v.slice(0, v.indexOf(",") + 1)}[REDACTED len=${v.length}]`;
      } else walk(v);
    }
  };
  walk(clone);
  return clone;
}

function structureReport(body) {
  const input = body.input;
  const content = Array.isArray(input) ? input[0]?.content : null;
  const image = Array.isArray(content)
    ? content.find((p) => p?.type === "input_image")
    : null;
  const text = Array.isArray(content)
    ? content.find((p) => p?.type === "input_text")
    : null;
  return {
    inputIsArray: Array.isArray(input),
    roleIsUser: input?.[0]?.role === "user",
    contentIsArray: Array.isArray(content),
    hasInputText: text?.type === "input_text",
    hasInputImage: image?.type === "input_image",
    imageUrlIsString: typeof image?.image_url === "string",
    imageUrlIsObject: image?.image_url !== null && typeof image?.image_url === "object",
    detail: image?.detail ?? null,
    detailIsHighOrLow: image?.detail === "high" || image?.detail === "low",
    sameContentArray: Boolean(text && image),
    keysOnImagePart: image ? Object.keys(image) : [],
    chatCompletionsShapeDetected:
      image?.type === "image_url" ||
      (image?.image_url !== null && typeof image?.image_url === "object"),
    matchesResponsesApi:
      image?.type === "input_image" &&
      typeof image?.image_url === "string" &&
      (image?.detail === "high" || image?.detail === "low"),
  };
}

async function callSdk(client, body) {
  try {
    const response = await client.responses.create(body);
    return {
      ok: true,
      path: "sdk",
      id: response.id,
      status: response.status,
      output_text: (response.output_text ?? "").slice(0, 200),
    };
  } catch (error) {
    const err = error?.error ?? error;
    return {
      ok: false,
      path: "sdk",
      status: error?.status ?? null,
      type: err?.type ?? null,
      code: err?.code ?? null,
      message: err?.message ?? error?.message ?? String(error),
      request_id: error?.requestID ?? null,
      param: err?.param ?? null,
    };
  }
}

function callHttp(apiKey, body) {
  const payload = JSON.stringify(body);
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: "api.openai.com",
        path: "/v1/responses",
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let parsed = null;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = { raw: raw.slice(0, 500) };
          }
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve({
              ok: true,
              path: "http",
              status: res.statusCode,
              id: parsed?.id ?? null,
              output_text: String(parsed?.output_text ?? "").slice(0, 200),
              request_id: res.headers["x-request-id"] ?? null,
            });
          } else {
            resolve({
              ok: false,
              path: "http",
              status: res.statusCode ?? null,
              type: parsed?.error?.type ?? null,
              code: parsed?.error?.code ?? null,
              message: parsed?.error?.message ?? raw.slice(0, 400),
              request_id: res.headers["x-request-id"] ?? null,
              param: parsed?.error?.param ?? null,
            });
          }
        });
      },
    );
    req.on("error", (error) => {
      resolve({ ok: false, path: "http", message: error.message });
    });
    req.write(payload);
    req.end();
  });
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    const payload = {
      ok: false,
      error: "OPENAI_API_KEY missing",
      productionDeployNote:
        "GitHub deployments: Production is still c8cbe09 (PR #54). PR #55 is Preview-only until merged.",
    };
    writeFileSync(path.join(OUT, "result.json"), JSON.stringify(payload, null, 2));
    console.error(JSON.stringify(payload, null, 2));
    process.exit(2);
  }
  if (!existsSync(FIXTURE)) {
    console.error("Missing fixture", FIXTURE);
    process.exit(2);
  }

  const bytes = readFileSync(FIXTURE);
  const openability = await openabilityReport(bytes, "known-good-raw");
  const dataUrl = `data:image/jpeg;base64,${bytes.toString("base64")}`;
  const integrity = inspectDataUrlIntegrity(dataUrl);

  // Decode data URL → file (requirement 2)
  const decoded = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
  const decodedReport = await openabilityReport(decoded, "from-data-url");

  const body = {
    model: MODEL,
    max_output_tokens: 64,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: "Reply with exactly: OK" },
          { type: "input_image", image_url: dataUrl, detail: "high" },
        ],
      },
    ],
  };

  const structure = structureReport(body);
  writeFileSync(
    path.join(OUT, "request-structure.json"),
    JSON.stringify({ structure, redacted: redactBody(body) }, null, 2),
  );
  writeFileSync(
    path.join(OUT, "integrity.json"),
    JSON.stringify({ integrity, openability, decodedReport }, null, 2),
  );

  const client = new OpenAI({ apiKey, maxRetries: 0 });
  const sdkResult = await callSdk(client, body);
  const httpResult = await callHttp(apiKey, body);

  let branch;
  if (sdkResult.ok && httpResult.ok) {
    branch =
      "A+B both OK with known-good JPEG → production failure is MINERVOT image/MIME/base64 path (or unmerged deploy), not Responses schema";
  } else if (!sdkResult.ok && httpResult.ok) {
    branch = "SDK-only failure → SDK usage/wrapping bug";
  } else if (sdkResult.ok && !httpResult.ok) {
    branch = "HTTP-only failure → unexpected; compare payloads";
  } else {
    branch =
      "Both failed with known-good JPEG → request structure / model / account (not user image bytes)";
  }

  const verdict = {
    ok: sdkResult.ok && httpResult.ok && integrity.ok && decodedReport.openable,
    model: MODEL,
    fixture: FIXTURE,
    fixtureBytes: bytes.length,
    integrity,
    openability,
    decodedReport,
    structure,
    sdkResult,
    httpResult,
    branch,
    deployNote:
      "Confirm failing host: Production=c8cbe09 (no PR55). Preview may have PR55.",
    at: new Date().toISOString(),
  };
  writeFileSync(path.join(OUT, "result.json"), JSON.stringify(verdict, null, 2));
  console.log(JSON.stringify(verdict, null, 2));
  process.exit(verdict.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
