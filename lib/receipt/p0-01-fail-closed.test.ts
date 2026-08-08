/**
 * P0-01: Production must never treat mock / invented receipt data as success.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isMockLlmEnabled } from "@/lib/ai/mock-responses";
import { classifyMediaImage } from "@/lib/media-pipelines/classify";
import { prepareMediaImages } from "@/lib/media-pipelines";

import { RECEIPT_USER_ERROR } from "./errors";
import { extractReceiptSchema } from "./extract";
import { runReceiptPipeline } from "./pipeline";
import { listLedgerEntries, resetHouseholdLedgerStoreForTests } from "./store";

const createMock = vi.fn();

vi.mock("@/lib/openai", () => ({
  isOpenAIConfigured: vi.fn(() => Boolean(process.env.OPENAI_API_KEY?.trim())),
  getOpenAIClient: vi.fn(() => ({
    responses: {
      create: (...args: unknown[]) => createMock(...args),
    },
  })),
}));

function tinyPng(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
}

async function sampleImage(filename = "photo.jpg") {
  const images = await prepareMediaImages([
    {
      filename,
      mimeType: "image/png",
      bytes: tinyPng(),
    },
  ]);
  return images[0]!;
}

const REAL_EXTRACT_JSON = JSON.stringify({
  visionSucceeded: true,
  overallConfidence: 0.91,
  storeName: "実在スーパー",
  phone: null,
  address: null,
  date: "2026-08-01",
  time: "18:20",
  items: [
    {
      name: "牛乳",
      quantity: 1,
      unitPrice: 198,
      tax: 16,
      taxRate: 0.08,
      amountInclTax: 214,
      confidence: 0.93,
    },
  ],
  subtotal: 198,
  taxTotal: 16,
  total: 214,
  paymentMethod: "現金",
  points: null,
  registerNo: null,
  staff: null,
  cardType: null,
  rawNotes: null,
  fieldConfidence: {
    storeName: 0.9,
    date: 0.92,
    total: 0.95,
    paymentMethod: 0.8,
    items: 0.9,
  },
});

describe("P0-01 receipt mock fail-closed", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    createMock.mockReset();
    resetHouseholdLedgerStoreForTests();
    delete process.env.ATLAS_MOCK_LLM;
    delete process.env.OPENAI_API_KEY;
    delete process.env.VERCEL_ENV;
    // vitest default; ensure non-production unless a case stubs it
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetHouseholdLedgerStoreForTests();
    delete process.env.ATLAS_MOCK_LLM;
    delete process.env.OPENAI_API_KEY;
  });

  it("A: OpenAI configured → real extract succeeds (no mock store names)", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-real");
    createMock.mockResolvedValue({ output_text: REAL_EXTRACT_JSON });

    const image = await sampleImage("receipt.jpg");
    const schema = await extractReceiptSchema(image, 0);

    expect(schema.visionSucceeded).toBe(true);
    expect(schema.storeName).toBe("実在スーパー");
    expect(schema.storeName).not.toBe("ローソン");
    expect(schema.model).not.toBe("atlas-mock");
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("B: OpenAI missing in production → explicit failure, ledger 0", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    delete process.env.OPENAI_API_KEY;
    delete process.env.ATLAS_MOCK_LLM;

    expect(isMockLlmEnabled()).toBe(false);

    const images = await prepareMediaImages([
      {
        filename: "receipt.jpg",
        mimeType: "image/png",
        bytes: tinyPng(),
      },
    ]);
    const session = await runReceiptPipeline({
      userId: "user_p001_b",
      images,
      userHint: "家計簿にして",
    });

    expect(session.status).toBe("failed");
    expect(session.error).toBe(RECEIPT_USER_ERROR.analysisFailed);
    expect(session.errorCode).toBe("config_missing");
    expect(session.retryable).toBe(false);
    expect(session.entriesPreview).toEqual([]);
    expect(listLedgerEntries("user_p001_b")).toHaveLength(0);
    expect(session.schemas.every((s) => s.visionSucceeded === false)).toBe(true);
    expect(session.schemas.some((s) => s.storeName === "ローソン")).toBe(false);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("C: OpenAI provider error → explicit failure, ledger 0, retryable", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("OPENAI_API_KEY", "sk-test-real");
    createMock.mockRejectedValue(new Error("429 rate limit exceeded"));

    const images = await prepareMediaImages([
      {
        filename: "receipt.jpg",
        mimeType: "image/png",
        bytes: tinyPng(),
      },
    ]);
    const session = await runReceiptPipeline({
      userId: "user_p001_c",
      images,
      userHint: "家計簿にして",
    });

    expect(session.status).toBe("failed");
    expect(session.error).toBe(RECEIPT_USER_ERROR.analysisFailed);
    expect(session.errorCode).toBe("provider_error");
    expect(session.retryable).toBe(true);
    expect(session.entriesPreview).toEqual([]);
    expect(listLedgerEntries("user_p001_c")).toHaveLength(0);
    expect(JSON.stringify(session)).not.toMatch(/sk-test|OPENAI_API_KEY|rate limit/i);
  });

  it("D: unreadable / empty vision output → explicit failure", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPENAI_API_KEY", "sk-test-real");
    createMock.mockResolvedValue({
      output_text: JSON.stringify({
        visionSucceeded: false,
        storeName: null,
        date: null,
        total: null,
        items: [],
      }),
    });

    const images = await prepareMediaImages([
      {
        filename: "receipt.jpg",
        mimeType: "image/png",
        bytes: tinyPng(),
      },
    ]);
    const session = await runReceiptPipeline({
      userId: "user_p001_d",
      images,
      userHint: "家計簿にして",
    });

    expect(session.status).toBe("failed");
    expect(session.errorCode).toBe("unreadable");
    expect(session.error).toBe(RECEIPT_USER_ERROR.unreadable);
    expect(session.retryable).toBe(false);
    expect(listLedgerEntries("user_p001_d")).toHaveLength(0);
  });

  it("E: non-production + ATLAS_MOCK_LLM=true → mock extract allowed", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("ATLAS_MOCK_LLM", "true");
    delete process.env.OPENAI_API_KEY;
    expect(isMockLlmEnabled()).toBe(true);

    const images = await prepareMediaImages([
      {
        filename: "receipt.jpg",
        mimeType: "image/png",
        bytes: tinyPng(),
      },
    ]);
    const session = await runReceiptPipeline({
      userId: "user_p001_e",
      images,
      userHint: "家計簿にして",
    });

    expect(session.status).toBe("registered");
    expect(session.schemas[0]?.model).toBe("atlas-mock");
    expect(session.schemas[0]?.storeName).toBe("ローソン");
    expect(listLedgerEntries("user_p001_e").length).toBeGreaterThan(0);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("F: production + ATLAS_MOCK_LLM=true → mock success forbidden", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("ATLAS_MOCK_LLM", "true");
    delete process.env.OPENAI_API_KEY;

    expect(isMockLlmEnabled()).toBe(false);

    const schema = await extractReceiptSchema(await sampleImage("receipt.jpg"), 0);
    expect(schema.visionSucceeded).toBe(false);
    expect(schema.failureCode).toBe("config_missing");
    expect(schema.model).not.toBe("atlas-mock");
    expect(schema.storeName).toBeNull();
    expect(schema.total).toBeNull();

    const images = await prepareMediaImages([
      {
        filename: "receipt.jpg",
        mimeType: "image/png",
        bytes: tinyPng(),
      },
    ]);
    const session = await runReceiptPipeline({
      userId: "user_p001_f",
      images,
      userHint: "家計簿にして",
    });
    expect(session.status).toBe("failed");
    expect(listLedgerEntries("user_p001_f")).toHaveLength(0);
    expect(session.schemas.some((s) => s.storeName === "ローソン")).toBe(false);
  });

  it("classify: production without OpenAI does not invent receipt", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    delete process.env.OPENAI_API_KEY;
    delete process.env.ATLAS_MOCK_LLM;

    const image = await sampleImage("random-photo.png");
    const result = await classifyMediaImage(image);
    expect(result.kind).toBe("other");
    expect(result.reason).toBe("openai_unavailable");
    expect(result.confidence).toBe(0);
  });

  it("classify: non-production mock may invent receipt for unlabeled images", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("ATLAS_MOCK_LLM", "true");
    delete process.env.OPENAI_API_KEY;

    const image = await sampleImage("random-photo.png");
    const result = await classifyMediaImage(image);
    expect(result.kind).toBe("receipt");
    expect(result.reason).toBe("mock");
  });

  it("regression: OpenAI missing in non-production without mock flag → fail-closed (no Lawson)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.ATLAS_MOCK_LLM;
    delete process.env.OPENAI_API_KEY;
    expect(isMockLlmEnabled()).toBe(false);

    const schema = await extractReceiptSchema(await sampleImage("receipt.jpg"), 0);
    expect(schema.visionSucceeded).toBe(false);
    expect(schema.failureCode).toBe("config_missing");
    expect(schema.storeName).toBeNull();
  });

  it("config vs transient: invalid API key is non-retryable", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-bad");
    createMock.mockRejectedValue(new Error("Incorrect API key provided"));

    const schema = await extractReceiptSchema(await sampleImage("receipt.jpg"), 0);
    expect(schema.visionSucceeded).toBe(false);
    expect(schema.failureCode).toBe("config_missing");
    expect(schema.retryable).toBe(false);
    expect(schema.rawNotes).toBe(RECEIPT_USER_ERROR.analysisFailed);
  });
});
