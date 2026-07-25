import { describe, expect, it } from "vitest";

import { ui } from "@/lib/i18n";
import { SIDEBAR_MORE_NAV } from "@/lib/layout/sidebar-items";
import { ATLAS_PROTECTED_PAGE_MATCHERS } from "@/lib/auth/public-routes";

describe("business profile navigation entry", () => {
  it("exposes settings hub copy with icon-ready title and description", () => {
    expect(ui.businessProfile.settingsLinkTitle).toBe("業務プロフィール");
    expect(ui.businessProfile.settingsLinkHint).toBe(
      "会社名、連絡先、署名などを登録すると、資料やメールへ自動入力できます",
    );
    expect(ui.businessProfile.backToSettings).toBe("設定一覧へ戻る");
    expect(ui.nav.businessProfile).toBe("業務プロフィール");
  });

  it("lists business profile in sidebar その他 for desktop discoverability", () => {
    const item = SIDEBAR_MORE_NAV.find((entry) => entry.id === "business-profile");
    expect(item).toEqual({
      id: "business-profile",
      href: "/settings/business-profile",
      label: "業務プロフィール",
      icon: "🏢",
    });
  });

  it("keeps /settings paths behind auth (includes business-profile)", () => {
    expect(ATLAS_PROTECTED_PAGE_MATCHERS).toContain("/settings(.*)");
  });
});
