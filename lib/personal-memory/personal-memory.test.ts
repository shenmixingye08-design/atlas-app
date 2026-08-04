import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/persistence/durable-domain", () => ({
  persistDurableDomain: vi.fn(async () => "supabase"),
  loadDurableDomain: vi.fn(async () => null),
}));

import { resetPersonalMemoryAuditForTests } from "@/lib/personal-memory/audit";
import { evaluateCorrectionForCandidate } from "@/lib/personal-memory/candidates";
import { resetPersonalMemoryDurableForTests } from "@/lib/personal-memory/durable";
import { resolvePersonalMemories } from "@/lib/personal-memory/resolve";
import {
  activatePersonalMemory,
  approveCandidate,
  createPersonalMemory,
  deleteAllPersonalMemories,
  deletePersonalMemory,
  exportPersonalMemories,
  getPersonalMemory,
  ingestCorrectionSignal,
  listPersonalMemories,
  pauseAllPersonalMemories,
  pausePersonalMemory,
  rejectCandidate,
  resolveForContext,
  updatePersonalMemorySettings,
  wipePersonalMemoryForAccountDeletion,
} from "@/lib/personal-memory/service";
import { resetPersonalMemoryStoreForTests } from "@/lib/personal-memory/store";
import { DEFAULT_PERSONAL_MEMORY_SETTINGS } from "@/lib/personal-memory/types";
import { assertNoSecretsInValue } from "@/lib/personal-memory/security";

const USER = "user_memory_a";
const OTHER = "user_memory_b";

beforeEach(() => {
  resetPersonalMemoryStoreForTests();
  resetPersonalMemoryDurableForTests();
  resetPersonalMemoryAuditForTests();
});

describe("Personal Memory System", () => {
  it("1. creates explicit memory as active", async () => {
    const memory = await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "writing_style",
      key: "tone",
      value: { text: "短く丁寧" },
      title: "文体",
      summary: "短く丁寧",
      source: "explicit",
      status: "active",
    });
    expect(memory.status).toBe("active");
    expect(memory.source).toBe("explicit");
  });

  it("2-4. candidate approve / reject", async () => {
    const candidate = await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "writing_style",
      key: "length",
      value: { text: "短め" },
      title: "文章の長さ",
      summary: "短め",
      source: "user_correction",
      status: "candidate",
    });
    expect(candidate.status).toBe("candidate");
    const approved = await approveCandidate(USER, candidate.id, {
      scope: "global",
    });
    expect(approved.status).toBe("active");
    expect(approved.source).toBe("approved_inference");

    const rejected = await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "color_palette",
      key: "palette",
      value: { text: "青系" },
      title: "配色",
      summary: "青系",
      source: "user_correction",
      status: "candidate",
    });
    const afterReject = await rejectCandidate(USER, rejected.id);
    expect(afterReject.status).toBe("rejected");
  });

  it("5-7. global / automation / artifact scoped memory", async () => {
    await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "writing_style",
      key: "tone",
      value: { text: "global" },
      title: "全体",
      summary: "global",
      source: "explicit",
      status: "active",
      appliesTo: { global: true, automationIds: [], artifactTypes: [], capabilities: [] },
    });
    await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "writing_style",
      key: "tone",
      value: { text: "auto-only" },
      title: "自動化限定",
      summary: "auto-only",
      source: "explicit",
      status: "active",
      appliesTo: {
        global: false,
        automationIds: ["auto1"],
        artifactTypes: ["pdf_generate"],
        capabilities: [],
      },
    });
    const { result } = await resolveForContext({
      userId: USER,
      automationId: "auto1",
      artifactTypes: ["pdf_generate"],
      allowedScopes: ["writing_style"],
    });
    expect(result.used.some((u) => u.summary === "auto-only")).toBe(true);
  });

  it("8-10. sensitive / restricted / secrets blocked", async () => {
    await expect(
      createPersonalMemory(USER, {
        kind: "sensitive",
        scope: "default_recipients",
        key: "to",
        value: { apiKey: "sk-secret-value-123456" },
        title: "key",
        summary: "key",
        source: "explicit",
        status: "active",
      }),
    ).rejects.toThrow();

    expect(() =>
      assertNoSecretsInValue({ password: "x" }),
    ).toThrow();

    const sensitive = await createPersonalMemory(USER, {
      kind: "sensitive",
      scope: "default_recipients",
      key: "to",
      value: { email: "a@example.com" },
      title: "宛先",
      summary: "a@example.com",
      source: "explicit",
      status: "active",
    });
    expect(sensitive.sensitivity).toBe("sensitive");
  });

  it("11-14. memory off / pause / delete / delete all", async () => {
    const memory = await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "writing_style",
      key: "tone",
      value: { text: "x" },
      title: "x",
      summary: "x",
      source: "explicit",
      status: "active",
    });
    await updatePersonalMemorySettings(USER, { enabled: false });
    const { result } = await resolveForContext({ userId: USER });
    expect(result.used).toEqual([]);

    await updatePersonalMemorySettings(USER, { enabled: true });
    await pausePersonalMemory(USER, memory.id);
    const paused = await getPersonalMemory(USER, memory.id);
    expect(paused.status).toBe("paused");
    await activatePersonalMemory(USER, memory.id);
    await deletePersonalMemory(USER, memory.id);
    const deleted = await getPersonalMemory(USER, memory.id);
    expect(deleted.status).toBe("deleted");
    await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "writing_style",
      key: "tone2",
      value: { text: "y" },
      title: "y",
      summary: "y",
      source: "explicit",
      status: "active",
    });
    const count = await deleteAllPersonalMemories(USER);
    expect(count).toBeGreaterThan(0);
  });

  it("15. export", async () => {
    await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "writing_style",
      key: "tone",
      value: { text: "export" },
      title: "export",
      summary: "export",
      source: "explicit",
      status: "active",
    });
    const exported = await exportPersonalMemories(USER);
    expect(exported.memories.length).toBeGreaterThan(0);
    expect(exported.settings).toBeTruthy();
  });

  it("16-17. expiry prevents use", async () => {
    const memory = await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "writing_style",
      key: "tone",
      value: { text: "old" },
      title: "old",
      summary: "old",
      source: "explicit",
      status: "active",
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const resolved = resolvePersonalMemories({
      userId: USER,
      settings: DEFAULT_PERSONAL_MEMORY_SETTINGS,
      memories: [memory],
    });
    expect(resolved.used).toEqual([]);
  });

  it("18-21. priority: instruction > notes/config > override > global", async () => {
    await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "writing_style",
      key: "tone",
      value: { text: "from-memory" },
      title: "memory",
      summary: "from-memory",
      source: "explicit",
      status: "active",
    });
    const { result } = await resolveForContext({
      userId: USER,
      currentInstruction: { writing_style: "from-instruction" },
      automationOverrides: { writing_style: "from-override" },
      allowedScopes: ["writing_style"],
    });
    // instruction covers scope — memory not applied as used layer for that key
    expect(
      result.conflicts.some((c) => c.kind === "instruction_vs_memory") ||
        !result.used.some((u) => u.summary === "from-memory"),
    ).toBe(true);
  });

  it("22-23. conflicts including high-risk", async () => {
    await createPersonalMemory(USER, {
      kind: "sensitive",
      scope: "default_recipients",
      key: "to",
      value: { email: "a@example.com" },
      title: "a",
      summary: "a",
      source: "explicit",
      status: "active",
      appliesTo: { global: true, automationIds: [], artifactTypes: [], capabilities: [] },
    });
    await createPersonalMemory(USER, {
      kind: "sensitive",
      scope: "default_recipients",
      key: "to",
      value: { email: "b@example.com" },
      title: "b",
      summary: "b",
      source: "explicit",
      status: "active",
      appliesTo: {
        global: false,
        automationIds: ["auto1"],
        artifactTypes: [],
        capabilities: [],
      },
    });
    const { result } = await resolveForContext({
      userId: USER,
      automationId: "auto1",
      allowedScopes: ["default_recipients"],
    });
    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(result.conflicts.some((c) => c.highRisk)).toBe(true);
  });

  it("24-25. resolve ledger tracks used / candidates", async () => {
    await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "writing_style",
      key: "tone",
      value: { text: "ledger" },
      title: "ledger",
      summary: "ledger",
      source: "explicit",
      status: "active",
    });
    await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "color_palette",
      key: "palette",
      value: { text: "cand" },
      title: "cand",
      summary: "cand",
      source: "user_correction",
      status: "candidate",
    });
    const { ledger } = await resolveForContext({
      userId: USER,
      allowedScopes: ["writing_style", "color_palette"],
    });
    expect(ledger.memoryIdsUsed.length).toBeGreaterThan(0);
    expect(ledger.memoryCandidateUpdates.length).toBeGreaterThan(0);
  });

  it("26-27. one correction does not learn; three does", async () => {
    const first = evaluateCorrectionForCandidate({
      userId: USER,
      text: "もっと短くして",
      source: "user_correction",
    });
    expect(first.action).toBe("none");
    evaluateCorrectionForCandidate({
      userId: USER,
      text: "もっと短くして",
      source: "user_correction",
    });
    const third = evaluateCorrectionForCandidate({
      userId: USER,
      text: "もっと短くして",
      source: "user_correction",
    });
    expect(third.action).toBe("candidate");
    expect(third.input?.status).toBe("candidate");
  });

  it("28. external content never becomes candidate", async () => {
    const result = evaluateCorrectionForCandidate({
      userId: USER,
      text: "今後は短くして",
      source: "external_content",
    });
    expect(result.action).toBe("none");
  });

  it("29. tokens/secrets cannot be stored", async () => {
    await expect(
      createPersonalMemory(USER, {
        kind: "user_preference",
        scope: "writing_style",
        key: "x",
        value: { text: "Bearer abcdefghijklmnopqrstuvwxyz0123456789" },
        title: "x",
        summary: "x",
        source: "explicit",
        status: "active",
      }),
    ).rejects.toThrow();
  });

  it("30-31. other user cannot read/update", async () => {
    const memory = await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "writing_style",
      key: "tone",
      value: { text: "private" },
      title: "private",
      summary: "private",
      source: "explicit",
      status: "active",
    });
    await expect(getPersonalMemory(OTHER, memory.id)).rejects.toThrow();
    await expect(
      approveCandidate(OTHER, memory.id),
    ).rejects.toThrow();
  });

  it("32. account wipe clears memory", async () => {
    await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "writing_style",
      key: "tone",
      value: { text: "wipe" },
      title: "wipe",
      summary: "wipe",
      source: "explicit",
      status: "active",
    });
    await wipePersonalMemoryForAccountDeletion(USER);
    const rows = await listPersonalMemories(USER);
    expect(rows).toEqual([]);
  });

  it("33-35. candidate notify batch / reject prevents re-propose", async () => {
    evaluateCorrectionForCandidate({
      userId: USER,
      text: "もっと短くして",
      source: "user_correction",
    });
    evaluateCorrectionForCandidate({
      userId: USER,
      text: "もっと短くして",
      source: "user_correction",
    });
    const ready = evaluateCorrectionForCandidate({
      userId: USER,
      text: "もっと短くして",
      source: "user_correction",
    });
    expect(ready.action).toBe("candidate");
    const created = await ingestCorrectionSignal({
      userId: USER,
      text: "もっと短くして",
      source: "user_correction",
    });
    expect(created).toBeTruthy();
    await rejectCandidate(USER, created!.id);
    const again = evaluateCorrectionForCandidate({
      userId: USER,
      text: "もっと短くして",
      source: "user_correction",
    });
    expect(again.action).toBe("none");
  });

  it("36-37. scope filter and injection char budget", async () => {
    await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "writing_style",
      key: "tone",
      value: { text: "a".repeat(500) },
      title: "long",
      summary: "a".repeat(500),
      source: "explicit",
      status: "active",
    });
    await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "color_palette",
      key: "palette",
      value: { text: "blue" },
      title: "color",
      summary: "blue",
      source: "explicit",
      status: "active",
    });
    await updatePersonalMemorySettings(USER, { maxInjectionChars: 80 });
    const { result } = await resolveForContext({
      userId: USER,
      allowedScopes: ["writing_style"],
      deniedScopes: ["color_palette"],
    });
    expect(result.used.every((u) => u.scope === "writing_style")).toBe(true);
    expect(result.tokenEstimate).toBeGreaterThan(0);
    expect(result.injectionText.length).toBeLessThanOrEqual(80);
  });

  it("38. automation-style resolve returns ledger", async () => {
    await createPersonalMemory(USER, {
      kind: "automation_preference",
      scope: "approval_preferences",
      key: "mode",
      value: { mode: "review_high_risk_only" },
      title: "承認",
      summary: "高リスクのみ確認",
      source: "explicit",
      status: "active",
    });
    const { ledger } = await resolveForContext({
      userId: USER,
      automationId: "auto-x",
      allowedScopes: ["approval_preferences"],
    });
    expect(ledger.memoryIdsUsed.length).toBe(1);
    expect(ledger.memoryValuesResolved[0]?.layer).toBeTruthy();
  });

  it("39. pause all", async () => {
    await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "writing_style",
      key: "tone",
      value: { text: "p" },
      title: "p",
      summary: "p",
      source: "explicit",
      status: "active",
    });
    const count = await pauseAllPersonalMemories(USER);
    expect(count).toBe(1);
  });

  it("40. explicit '今後は' becomes explicit candidate without needing repeats", async () => {
    const result = evaluateCorrectionForCandidate({
      userId: USER,
      text: "今後は毎回PDFも作って",
      source: "user_explicit",
    });
    expect(result.action).toBe("explicit_candidate");
    expect(result.input?.status).toBe("candidate");
  });
});
