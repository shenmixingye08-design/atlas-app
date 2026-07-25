import { describe, expect, it } from "vitest";

import { detectForbiddenSecretInput } from "./forbidden";

describe("detectForbiddenSecretInput", () => {
  it("rejects password-like labels", () => {
    expect(
      detectForbiddenSecretInput("ログインパスワード", "loginPassword", "secret"),
    ).toMatchObject({ forbidden: true });
  });

  it("rejects API key-like values", () => {
    expect(
      detectForbiddenSecretInput("メモ", "memo", "sk-1234567890abcdef1234567890"),
    ).toMatchObject({ forbidden: true });
  });

  it("rejects credit card numbers", () => {
    const result = detectForbiddenSecretInput(
      "カード",
      "billingCard",
      "4111 1111 1111 1111",
    );
    expect(result.forbidden).toBe(true);
    expect(result.reasonJa).toContain("クレジットカード");
  });

  it("rejects My Number-like values", () => {
    expect(
      detectForbiddenSecretInput("番号", "personalNumber", "1234-5678-9012"),
    ).toMatchObject({ forbidden: true });
  });

  it("allows ordinary business profile values", () => {
    expect(
      detectForbiddenSecretInput("会社名", "companyName", "株式会社ATLAS"),
    ).toEqual({ forbidden: false, reasonJa: "" });
  });
});
