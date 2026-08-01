import { beforeEach, describe, expect, it } from "vitest";

import { registerRootArtifact } from "@/lib/artifacts/registry";
import {
  resetDeliverableMemoryStoreForTests,
} from "@/lib/deliverables/store";
import { resetDeliverableVersionsForTests } from "@/lib/deliverables/versioning";
import {
  assertArtifactAccess,
  assertOwnerImmutable,
  assertSignedUrlOwner,
} from "@/lib/storage/authz";
import { minimalPdf } from "@/lib/storage/minimal-zip";

describe("storage authz", () => {
  beforeEach(() => {
    resetDeliverableMemoryStoreForTests();
    resetDeliverableVersionsForTests();
  });

  it("denies cross-user get/preview/download/revision/delete", async () => {
    const { stored } = registerRootArtifact({
      ownerId: "owner_a",
      buffer: minimalPdf(),
      fileName: "a.pdf",
      kind: "pdf",
    });

    for (const action of [
      "get",
      "preview",
      "download",
      "revision",
      "delete",
      "signed_url",
    ] as const) {
      const result = await assertArtifactAccess({
        artifactId: stored.id,
        requesterId: "owner_b",
        action,
      });
      expect(result.ok).toBe(false);
    }
  });

  it("rejects owner change and signed URL guess", () => {
    expect(
      assertOwnerImmutable({
        existingOwnerId: "a",
        proposedOwnerId: "b",
      }),
    ).toBe(false);
    expect(
      assertSignedUrlOwner({
        tokenOwnerId: "attacker",
        artifactOwnerId: "owner",
      }),
    ).toBe(false);
  });
});
