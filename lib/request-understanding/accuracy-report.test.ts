import { describe, expect, it } from "vitest";

import { EVALUATION_CASES, evaluateCase } from "./evaluation-100";
import { formatsFromParsedRequest, understandRequest } from "./understand";

describe("request understanding accuracy report", () => {
  it("reports intent/format accuracy for QA dashboard", () => {
    let intentModeOk = 0;
    let formatOk = 0;
    let formatChecked = 0;
    let falseExternal = 0;
    let unnecessaryClarify = 0;
    let clarifyChecked = 0;
    let missingMiss = 0;
    let missingChecked = 0;
    const byCategory: Record<string, { n: number; ok: number }> = {};

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

      const cat = byCategory[c.category] ?? { n: 0, ok: 0 };
      cat.n += 1;
      if (c.expectMode.includes(parsed.execution_mode)) {
        intentModeOk += 1;
        cat.ok += 1;
      }
      byCategory[c.category] = cat;

      if (c.expectFormats || c.expectFormatAnyOf) {
        formatChecked += 1;
        if (!evaluation.reasons.some((r) => r.includes("format"))) formatOk += 1;
      }
      if (
        c.expectNoExternal &&
        parsed.risks.includes("external_action_requires_confirmation")
      ) {
        falseExternal += 1;
      }
      if (c.expectMissing) {
        missingChecked += 1;
        if (
          parsed.missing_required_fields.length === 0 &&
          !parsed.needs_clarification
        ) {
          missingMiss += 1;
        }
      }
      if (
        parsed.needs_clarification &&
        parsed.confidence >= 0.7 &&
        parsed.missing_required_fields.length === 0 &&
        !c.expectClarify
      ) {
        unnecessaryClarify += 1;
        clarifyChecked += 1;
      }
    }

    const total = EVALUATION_CASES.length;
    const modeAccuracy = intentModeOk / total;
    const formatAccuracy = formatChecked ? formatOk / formatChecked : 1;

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          cases: total,
          modeAccuracy: Number(modeAccuracy.toFixed(4)),
          formatAccuracy: Number(formatAccuracy.toFixed(4)),
          falseExternal,
          unnecessaryClarify,
          missingMissRate: missingChecked ? missingMiss / missingChecked : 0,
          byCategory: Object.fromEntries(
            Object.entries(byCategory).map(([k, v]) => [
              k,
              { n: v.n, accuracy: Number((v.ok / v.n).toFixed(4)) },
            ]),
          ),
        },
        null,
        2,
      ),
    );

    expect(modeAccuracy).toBeGreaterThanOrEqual(0.95);
    expect(formatAccuracy).toBeGreaterThanOrEqual(0.95);
    expect(falseExternal).toBe(0);
  });
});
