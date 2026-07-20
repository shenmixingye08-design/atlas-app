/**
 * Public site / operator configuration.
 * Prefer env vars in production so 特商法 fields are never shipped as placeholders.
 */

import { isAtlasProduction } from "@/lib/runtime/is-production";

export type SitePaymentMethod = {
  id: string;
  label: string;
  /** e.g. クレジットカード — add PayPay etc. when enabled */
  methods: readonly string[];
};

export type SiteOperatorConfig = {
  /** 販売事業者 */
  businessName: string;
  /** 運営責任者 */
  representativeName: string;
  /** 公開用所在地（法人化後は本店住所へ更新） */
  address: string;
  contactEmail: string;
  contactPath: string;
};

const FALLBACK_OPERATOR = {
  businessName: "MINERVOT",
  representativeName: "（運営責任者名を設定してください）",
  address: "（公開用住所を設定してください）",
  contactEmail: "support@atlas.app",
  contactPath: "/contact",
} as const satisfies SiteOperatorConfig;

export const siteConfig = {
  operator: FALLBACK_OPERATOR,

  /** Landing pricing section anchor */
  pricingPagePath: "/#pricing",
  billingSettingsPath: "/settings/billing",

  /**
   * 支払方法 — Stripe 以外を追加する場合はここに追記。
   * 例: { id: "paypay", label: "PayPay", methods: ["PayPay残高"] }
   */
  paymentMethods: [
    {
      id: "stripe",
      label: "Stripe",
      methods: ["クレジットカード（VISA / Mastercard / American Express 等）"],
    },
  ] satisfies readonly SitePaymentMethod[],
} as const;

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

/** True when 特商法に必要な公開事業者情報が揃っている。 */
export function isSiteOperatorConfigured(): boolean {
  const operator = getSiteOperator();
  return (
    !operator.representativeName.includes("設定してください") &&
    !operator.address.includes("設定してください") &&
    Boolean(operator.businessName.trim()) &&
    Boolean(operator.contactEmail.trim()) &&
    !operator.contactEmail.endsWith("@atlas.app")
  );
}

export function getSiteOperator(): SiteOperatorConfig {
  return {
    businessName:
      readEnv("ATLAS_OPERATOR_BUSINESS_NAME") ?? FALLBACK_OPERATOR.businessName,
    representativeName:
      readEnv("ATLAS_OPERATOR_REPRESENTATIVE_NAME") ??
      FALLBACK_OPERATOR.representativeName,
    address: readEnv("ATLAS_OPERATOR_ADDRESS") ?? FALLBACK_OPERATOR.address,
    contactEmail:
      readEnv("ATLAS_OPERATOR_CONTACT_EMAIL") ?? FALLBACK_OPERATOR.contactEmail,
    contactPath: FALLBACK_OPERATOR.contactPath,
  };
}

/** Soft warning for operators — does not crash the app. */
export function warnIfOperatorIncompleteInProduction(): void {
  if (!isAtlasProduction()) return;
  if (isSiteOperatorConfigured()) return;
  console.warn(
    "[ATLAS] 特商法公開情報が未設定です。ATLAS_OPERATOR_BUSINESS_NAME / REPRESENTATIVE_NAME / ADDRESS / CONTACT_EMAIL を設定してください。",
  );
}
