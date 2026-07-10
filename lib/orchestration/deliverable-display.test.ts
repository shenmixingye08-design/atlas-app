import { describe, expect, it } from "vitest";

import { emptyDeliverable } from "@/lib/orchestration/deliverable-types";
import {
  getEmailDisplayFields,
  isDeliverableJsonText,
  normalizeDeliverableForDisplay,
  sanitizeBodyTextForDisplay,
} from "@/lib/orchestration/deliverable-display";

describe("deliverable-display", () => {
  it("detects deliverable-shaped JSON", () => {
    expect(isDeliverableJsonText('{"type":"email","title":"Test"}')).toBe(true);
    expect(isDeliverableJsonText("plain prose")).toBe(false);
  });

  it("unwraps JSON embedded in content for email display", () => {
    const embedded = JSON.stringify({
      type: "email",
      title: "営業メール",
      summary: "概要テキスト",
      content: "件名：太陽光のご提案\n\n本文です。",
      metadata: { subject: "太陽光のご提案" },
    });

    const deliverable = {
      ...emptyDeliverable("email"),
      type: "email" as const,
      title: "営業メール",
      summary: "概要テキスト",
      content: embedded,
    };

    const normalized = normalizeDeliverableForDisplay(deliverable);
    const fields = getEmailDisplayFields(normalized);

    expect(fields.subject).toBe("太陽光のご提案");
    expect(fields.body).toContain("本文です");
    expect(sanitizeBodyTextForDisplay(normalized.content)).not.toMatch(/^\s*\{/);
  });

  it("never returns raw JSON from sanitizeBodyTextForDisplay", () => {
    const json = '{"type":"email","title":"x","summary":"y","content":"hello"}';
    expect(sanitizeBodyTextForDisplay(json)).toBe("hello");
  });
});
