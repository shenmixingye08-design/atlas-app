/**
 * Public site / operator configuration.
 * Update these values when incorporating or changing legal entity details.
 */

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

export const siteConfig = {
  operator: {
    businessName: "ATLAS",
    representativeName: "（運営責任者名を設定してください）",
    address: "（公開用住所を設定してください）",
    contactEmail: "support@atlas.app",
    contactPath: "/contact",
  } satisfies SiteOperatorConfig,

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

export function getSiteOperator(): SiteOperatorConfig {
  return siteConfig.operator;
}
