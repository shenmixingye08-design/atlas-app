import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClientIfConfigured: vi.fn(() => null),
}));

import { createProfile } from "./service";
import { resolveArtifactContext } from "./resolve-context";
import { applyTemplateVariables } from "./template-vars";
import { resetBusinessProfileRepositoryForTests } from "./store";

beforeEach(() => {
  resetBusinessProfileRepositoryForTests();
});

describe("resolveArtifactContext", () => {
  it("resolves company name for template insertion", async () => {
    await createProfile("user_a", {
      companyName: "株式会社ATLAS",
      isDefault: true,
    });

    const context = await resolveArtifactContext({
      ownerUserId: "user_a",
      template: "会社名: {{profile.companyName}}",
    });

    expect(context.variables["profile.companyName"]).toBe("株式会社ATLAS");
    expect(applyTemplateVariables("会社名: {{profile.companyName}}", context)).toBe(
      "会社名: 株式会社ATLAS",
    );
  });

  it("marks missing required fields as needs_input", async () => {
    await createProfile("user_a", {
      companyName: "株式会社ATLAS",
      isDefault: true,
    });

    const context = await resolveArtifactContext({
      ownerUserId: "user_a",
      template: "電話: {{profile.phone}}",
    });

    expect(context.needsInput.status).toBe("needs_input");
    expect(context.missingRequired.map((field) => field.key)).toContain(
      "profile.phone",
    );
  });

  it("does not use ai_inferred values for formal phone fields", async () => {
    await createProfile("user_a", {
      companyName: "株式会社ATLAS",
      isDefault: true,
    });

    const context = await resolveArtifactContext({
      ownerUserId: "user_a",
      template: "電話: {{profile.phone}}",
      aiInferredFields: {
        "profile.phone": "090-1234-5678",
      },
    });

    expect(context.variables["profile.phone"]).toBeNull();
    expect(context.needsInput.status).toBe("needs_input");
    expect(context.usedFields.find((field) => field.key === "profile.phone")?.sourceKind).toBe(
      "saved_profile",
    );
  });
});
