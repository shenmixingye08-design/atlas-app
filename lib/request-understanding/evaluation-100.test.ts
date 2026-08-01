import { describe, expect, it } from "vitest";

import {
  EVALUATION_CASES,
  evaluateCase,
} from "./evaluation-100";
import { formatsFromParsedRequest, understandRequest } from "./understand";

describe("request understanding evaluation set (100+)", () => {
  it("has at least 100 cases with required category counts", () => {
    expect(EVALUATION_CASES.length).toBeGreaterThanOrEqual(100);
    const count = (c: string) =>
      EVALUATION_CASES.filter((x) => x.category === c).length;
    expect(count("word")).toBeGreaterThanOrEqual(15);
    expect(count("excel")).toBeGreaterThanOrEqual(15);
    expect(count("pdf")).toBeGreaterThanOrEqual(15);
    expect(count("pptx")).toBeGreaterThanOrEqual(15);
    expect(count("convert")).toBeGreaterThanOrEqual(15);
    expect(count("external")).toBeGreaterThanOrEqual(10);
    expect(count("automation")).toBeGreaterThanOrEqual(10);
  });

  it("meets production accuracy targets", () => {
    let intentModeOk = 0;
    let formatOk = 0;
    let formatChecked = 0;
    let falseExternal = 0;
    let unnecessaryClarify = 0;
    let clarifyChecked = 0;
    let missingMiss = 0;
    let missingChecked = 0;
    const failures: string[] = [];

    for (const c of EVALUATION_CASES) {
      const parsed = understandRequest({
        assignment: c.assignment,
        attachments: c.attachments?.map((a, index) => ({
          id: `${c.id}_${index}`,
          fileName: a.fileName,
          mimeType: a.mimeType,
        })),
      });
      const formats = formatsFromParsedRequest(parsed);
      const evaluation = evaluateCase(
        {
          mode: parsed.execution_mode,
          formats,
          missing: parsed.missing_required_fields,
          needsClarify: parsed.needs_clarification,
          risks: parsed.risks,
          intent: parsed.intent,
          unsupported: parsed.intent === "unsupported",
        },
        c,
      );

      if (c.expectMode.includes(parsed.execution_mode)) intentModeOk += 1;
      else failures.push(`${c.id}: mode ${parsed.execution_mode}`);

      if (c.expectFormats || c.expectFormatAnyOf) {
        formatChecked += 1;
        const formatPass = !evaluation.reasons.some((r) => r.includes("format"));
        if (formatPass) formatOk += 1;
        else failures.push(`${c.id}: formats ${formats.join(",")}`);
      }

      if (c.expectNoExternal) {
        if (parsed.risks.includes("external_action_requires_confirmation")) {
          falseExternal += 1;
          failures.push(`${c.id}: false external`);
        }
      }

      if (c.expectClarify || c.allowUnnecessaryClarify) {
        clarifyChecked += 1;
        if (
          parsed.needs_clarification &&
          c.allowUnnecessaryClarify &&
          !c.expectClarify &&
          parsed.confidence >= 0.7
        ) {
          unnecessaryClarify += 1;
        }
      } else if (
        parsed.needs_clarification &&
        parsed.confidence >= 0.7 &&
        parsed.missing_required_fields.length === 0
      ) {
        unnecessaryClarify += 1;
        clarifyChecked += 1;
      }

      if (c.expectMissing) {
        missingChecked += 1;
        if (parsed.missing_required_fields.length === 0 && !parsed.needs_clarification) {
          missingMiss += 1;
          failures.push(`${c.id}: missed required info`);
        }
      }
    }

    const total = EVALUATION_CASES.length;
    const modeAccuracy = intentModeOk / total;
    const formatAccuracy = formatChecked ? formatOk / formatChecked : 1;
    const unnecessaryRate =
      clarifyChecked > 0 ? unnecessaryClarify / Math.max(clarifyChecked, total) : 0;
    const missingMissRate = missingChecked ? missingMiss / missingChecked : 0;

    expect(falseExternal, `false externals: ${failures.filter((f) => f.includes("false external")).join("; ")}`).toBe(0);
    expect(modeAccuracy).toBeGreaterThanOrEqual(0.95);
    expect(formatAccuracy).toBeGreaterThanOrEqual(0.95);
    expect(unnecessaryRate).toBeLessThan(0.1);
    expect(missingMissRate).toBeLessThanOrEqual(0.02);
  });
});
