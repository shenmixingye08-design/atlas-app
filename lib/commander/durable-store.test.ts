import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const serviceClientMock = vi.fn();
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClientIfConfigured: () => serviceClientMock(),
}));

import { loadPersistedProjectById } from "./durable-store";

/** Build a chainable Supabase query stub resolving to `result`. */
function buildClient(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn(async () => result);
  const eqUser = vi.fn(() => ({ maybeSingle }));
  const eqId = vi.fn(() => ({ eq: eqUser }));
  const select = vi.fn(() => ({ eq: eqId }));
  const from = vi.fn(() => ({ select }));
  return { client: { from }, from, select, eqId, eqUser, maybeSingle };
}

describe("loadPersistedProjectById", () => {
  beforeEach(() => {
    serviceClientMock.mockReset();
  });

  it("signals non-durable when Supabase is not configured", async () => {
    serviceClientMock.mockReturnValue(null);
    const out = await loadPersistedProjectById({
      userId: "user_a",
      projectId: "commander-run_1",
    });
    expect(out).toEqual({ project: null, found: false, durable: false });
  });

  it("reads a row scoped to id + user and maps it to a project", async () => {
    const row = {
      id: "commander-run_1",
      user_id: "user_a",
      title: "成果物",
      work_request: "依頼",
      status: "completed",
      progress: 100,
      assigned_employees: [],
      result: null,
      error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const stub = buildClient({ data: row, error: null });
    serviceClientMock.mockReturnValue(stub.client);

    const out = await loadPersistedProjectById({
      userId: "user_a",
      projectId: "commander-run_1",
    });

    expect(stub.from).toHaveBeenCalledWith("projects");
    expect(stub.eqId).toHaveBeenCalledWith("id", "commander-run_1");
    expect(stub.eqUser).toHaveBeenCalledWith("user_id", "user_a");
    expect(out.durable).toBe(true);
    expect(out.found).toBe(true);
    expect(out.project?.id).toBe("commander-run_1");
    expect(out.project?.title).toBe("成果物");
  });

  it("reports a confirmed durable miss when no row matches", async () => {
    const stub = buildClient({ data: null, error: null });
    serviceClientMock.mockReturnValue(stub.client);

    const out = await loadPersistedProjectById({
      userId: "user_a",
      projectId: "missing",
    });

    expect(out).toEqual({ project: null, found: false, durable: true });
  });

  it("treats a read error as non-durable (client cache fallback)", async () => {
    const stub = buildClient({ data: null, error: { message: "boom" } });
    serviceClientMock.mockReturnValue(stub.client);

    const out = await loadPersistedProjectById({
      userId: "user_a",
      projectId: "commander-run_1",
    });

    expect(out).toEqual({ project: null, found: false, durable: false });
  });
});
