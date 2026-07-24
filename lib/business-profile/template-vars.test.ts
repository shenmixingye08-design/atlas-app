import { describe, expect, it } from "vitest";

import { applyTemplateVariables, extractTemplateVariables } from "./template-vars";
import type { ArtifactContext } from "./types";

function context(variables: Record<string, string | null>): ArtifactContext {
  return {
    ownerUserId: "user_a",
    profile: null,
    contacts: [],
    project: null,
    fields: [],
    usedFields: [],
    unusedFields: [],
    missingRequired: [],
    variables,
    needsInput: { status: "ready", missingRequired: [] },
  };
}

describe("template variables", () => {
  it("extracts supported profile/contact/project variables", () => {
    expect(
      extractTemplateVariables(
        "{{profile.companyName}} / {{ contact.displayName }} / {{project.title}}",
      ),
    ).toEqual([
      "profile.companyName",
      "contact.displayName",
      "project.title",
    ]);
  });

  it("applies profile, contact, and project replacements", () => {
    const output = applyTemplateVariables(
      "{{profile.companyName}} - {{contact.displayName}} - {{project.title}}",
      context({
        "profile.companyName": "株式会社ATLAS",
        "contact.displayName": "山田太郎",
        "project.title": "提案書作成",
      }),
    );

    expect(output).toBe("株式会社ATLAS - 山田太郎 - 提案書作成");
  });

  it("leaves missing required variables as markers", () => {
    expect(
      applyTemplateVariables("電話: {{profile.phone}}", context({}), {
        requiredVariables: ["profile.phone"],
      }),
    ).toBe("電話: [[MISSING:profile.phone]]");
  });
});
