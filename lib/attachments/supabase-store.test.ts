import { beforeEach, describe, expect, it, vi } from "vitest";

const uploadMock = vi.fn();
const removeMock = vi.fn();
const downloadMock = vi.fn();
const createSignedUrlMock = vi.fn();
const insertMock = vi.fn();
const selectEqMock = vi.fn();
const deleteEqMock = vi.fn();
const updateEqMock = vi.fn();

vi.mock("@/lib/attachments/ensure-infrastructure", () => ({
  assertAttachmentInfrastructureReady: vi.fn(async () => ({
    ready: true,
    backend: "supabase",
    bucketExists: true,
    tableExists: true,
  })),
  ensureAttachmentInfrastructure: vi.fn(async () => ({
    ready: true,
    backend: "supabase",
    bucketExists: true,
    tableExists: true,
  })),
}));

/** 1×1 PNG — real magic bytes for round-trip / read guards. */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClientIfConfigured: () => ({
    storage: {
      from: () => ({
        upload: uploadMock,
        remove: removeMock,
        download: downloadMock,
        createSignedUrl: createSignedUrlMock,
      }),
      listBuckets: async () => ({
        data: [{ name: "atlas-image-attachments" }],
        error: null,
      }),
    },
    from: () => ({
      insert: (payload: unknown) => {
        insertMock(payload);
        return Promise.resolve({ error: null });
      },
      select: () => ({
        limit: async () => ({ data: [], error: null }),
        eq: (...args: unknown[]) => {
          selectEqMock(...args);
          return {
            maybeSingle: async () => ({
              data: {
                id: "img_test",
                user_id: "user_a",
                job_id: "job_1",
                original_file_name: "a.png",
                mime_type: "image/png",
                original_mime_type: "image/png",
                original_bytes: TINY_PNG.length,
                processed_bytes: TINY_PNG.length,
                width: 1,
                height: 1,
                content_hash: "abc",
                original_storage_path: "user_a/job_1/img_test/original.png",
                processed_storage_path: "user_a/job_1/img_test/processed.png",
                retention_policy: "temporary",
                expires_at: new Date(Date.now() + 60_000).toISOString(),
                created_at: new Date().toISOString(),
              },
              error: null,
            }),
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          };
        },
      }),
      update: () => ({
        eq: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: async () => {
                updateEqMock();
                return { data: null, error: null };
              },
            }),
          }),
        }),
      }),
      delete: () => ({
        eq: () => ({
          eq: (...args: unknown[]) => {
            deleteEqMock(...args);
            return Promise.resolve({ error: null });
          },
        }),
      }),
    }),
  }),
}));

describe("supabase image store", () => {
  beforeEach(() => {
    uploadMock.mockReset();
    removeMock.mockReset();
    downloadMock.mockReset();
    insertMock.mockReset();
    uploadMock.mockResolvedValue({ error: null });
    removeMock.mockResolvedValue({ error: null });
    downloadMock.mockResolvedValue({
      data: new Blob([TINY_PNG]),
      error: null,
    });
  });

  it("uploads original+processed under userId/jobId/attachmentId and inserts DB row", async () => {
    const { supabaseSaveImageAttachment } = await import(
      "@/lib/attachments/supabase-store"
    );

    const saved = await supabaseSaveImageAttachment({
      userId: "user_a",
      jobId: "job_1",
      originalFileName: "shot.png",
      mimeType: "image/png",
      originalBuffer: TINY_PNG,
      processedBuffer: TINY_PNG,
      processedMimeType: "image/png",
      width: 1,
      height: 1,
      contentHash: "hash1",
    });

    expect(uploadMock).toHaveBeenCalledTimes(2);
    const firstPath = uploadMock.mock.calls[0]?.[0] as string;
    expect(firstPath.startsWith("user_a/job_1/")).toBe(true);
    expect(firstPath.includes("/original.png")).toBe(true);
    expect(insertMock).toHaveBeenCalled();
    expect(downloadMock).toHaveBeenCalled();
    expect(saved.storageBackend).toBe("supabase");
    expect(saved.jobId).toBe("job_1");
  });

  it("reads processed bytes for OpenAI Base64 path", async () => {
    const { supabaseReadProcessedImageBytes } = await import(
      "@/lib/attachments/supabase-store"
    );
    const bytes = await supabaseReadProcessedImageBytes("user_a", "img_test");
    expect(bytes?.buffer.equals(TINY_PNG)).toBe(true);
    expect(downloadMock).toHaveBeenCalled();
  });
});
