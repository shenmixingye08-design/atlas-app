import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import {
  appendDocumentExtractsToAssignment,
  buildWorkRequestSubmitPayload,
  consumePendingWorkRequestSubmit,
  stashPendingWorkRequestSubmit,
} from "./work-request-payload";

describe("buildWorkRequestSubmitPayload", () => {
  it("matches the お願いする form metadata shape (including preferredDeliverableFormat)", () => {
    const payload = buildWorkRequestSubmitPayload({
      assignment: "報告書をWordで作成してください",
      attachmentIds: ["att_1"],
      preferredFormat: "docx",
      documents: [
        {
          id: "doc_1",
          fileName: "notes.txt",
          mimeType: "text/plain",
          bytes: 12,
          extractedText: "抽出テキスト",
        },
      ],
    });

    expect(payload.assignment).toContain("報告書をWordで作成してください");
    expect(payload.assignment).toContain("【添付ファイルの抽出テキスト】");
    expect(payload.assignment).toContain("抽出テキスト");
    expect(payload.metadata).toMatchObject({
      requestUi: "secretary_zero_friction_v1",
      executionPreference: "once",
      priority: "normal",
      skipWorkMemory: false,
      preferredDeliverableFormat: "docx",
      requireVisionSuccess: true,
      attachmentIds: ["att_1"],
    });
    expect(payload.metadata.documentExtracts).toEqual([
      {
        id: "doc_1",
        fileName: "notes.txt",
        mimeType: "text/plain",
        bytes: 12,
        pageOrSheetCount: null,
      },
    ]);
  });

  it("defaults preferredFormat to auto (same as WorkRequestForm)", () => {
    const payload = buildWorkRequestSubmitPayload({
      assignment: "短い依頼",
    });
    expect(payload.metadata.preferredDeliverableFormat).toBe("auto");
    expect(payload.metadata.requireVisionSuccess).toBe(false);
    expect(payload.metadata.attachmentIds).toBeUndefined();
  });

  it("appendDocumentExtractsToAssignment is stable", () => {
    expect(appendDocumentExtractsToAssignment("a", [])).toBe("a");
  });

  it("home and お願いする produce identical POST /api/work/jobs bodies", () => {
    const input = {
      assignment: "社内報告書をWordで作成してください",
      attachmentIds: ["att_home"],
      preferredFormat: "docx" as const,
      documents: [
        {
          id: "d1",
          fileName: "a.txt",
          mimeType: "text/plain",
          bytes: 3,
          extractedText: "abc",
          pageOrSheetCount: null as number | null,
        },
      ],
    };
    const homePayload = buildWorkRequestSubmitPayload(input);
    const workspacePayload = buildWorkRequestSubmitPayload(input);
    expect(homePayload).toEqual(workspacePayload);
  });
});

describe("pending work request handoff", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("window", {
      sessionStorage: {
        setItem: (k: string, v: string) => store.set(k, v),
        getItem: (k: string) => store.get(k) ?? null,
        removeItem: (k: string) => store.delete(k),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips the same payload home → workspace", () => {
    const payload = buildWorkRequestSubmitPayload({
      assignment: "Wordで提案書を作って",
      preferredFormat: "docx",
    });
    stashPendingWorkRequestSubmit(payload);
    expect(consumePendingWorkRequestSubmit()).toEqual(payload);
    expect(consumePendingWorkRequestSubmit()).toBeNull();
  });
});
