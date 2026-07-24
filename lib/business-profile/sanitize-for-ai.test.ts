import { describe, expect, it } from "vitest";

import { sanitizeContextForAI } from "./sanitize-for-ai";
import type { ArtifactContext, ResolvedField } from "./types";

function field(patch: Partial<ResolvedField> & { key: string; value: string | null }): ResolvedField {
  return {
    label: patch.key,
    valueType: "text",
    sensitivity: "public",
    usage: {
      aiUsageAllowed: true,
      documentUsageAllowed: true,
      usageForbidden: false,
    },
    sourceKind: "saved_profile",
    sourceId: "profile_1",
    sourceLabel: "株式会社A",
    missing: patch.value === null,
    required: false,
    ...patch,
  };
}

describe("sanitizeContextForAI", () => {
  it("excludes secrets, bank fields, restricted fields, and usage-forbidden fields", () => {
    const context: ArtifactContext = {
      ownerUserId: "user_a",
      profile: null,
      contacts: [],
      project: null,
      fields: [
        field({ key: "profile.companyName", value: "株式会社A" }),
        field({
          key: "profile.privateMemo",
          value: "社外秘",
          sensitivity: "restricted",
        }),
        field({
          key: "profile.apiToken",
          value: "token",
          sensitivity: "secret",
        }),
        field({ key: "profile.bankAccountNumber", value: "1234567" }),
        field({
          key: "profile.notes",
          value: "使わない",
          usage: {
            aiUsageAllowed: false,
            documentUsageAllowed: true,
            usageForbidden: false,
          },
        }),
        field({
          key: "profile.legacy",
          value: "禁止",
          usage: {
            aiUsageAllowed: true,
            documentUsageAllowed: true,
            usageForbidden: true,
          },
        }),
      ],
      usedFields: [],
      unusedFields: [],
      missingRequired: [],
      variables: {},
      needsInput: { status: "ready", missingRequired: [] },
    };

    expect(sanitizeContextForAI(context).fields).toEqual([
      {
        key: "profile.companyName",
        label: "profile.companyName",
        value: "株式会社A",
        valueType: "text",
        sourceKind: "saved_profile",
        sourceLabel: "株式会社A",
      },
    ]);
  });
});
