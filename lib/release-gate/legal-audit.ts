export type LegalItemStatus = "ok_display" | "needs_legal_review" | "missing" | "partial";

export type LegalAuditItem = {
  id: string;
  title: string;
  status: LegalItemStatus;
  notes: string;
  pathHint?: string;
};

/** Display/audit only — not legal advice. Expert review required where marked. */
export const LEGAL_AUDIT_ITEMS: LegalAuditItem[] = [
  {
    id: "terms",
    title: "利用規約",
    status: "ok_display",
    pathHint: "/legal/terms",
    notes: "ページ表示あり。条文の法的十分性は専門家確認が必要。",
  },
  {
    id: "privacy",
    title: "プライバシーポリシー",
    status: "ok_display",
    pathHint: "/legal/privacy",
    notes: "ページ表示あり。個人情報取扱いの十分性は専門家確認が必要。",
  },
  {
    id: "tokusho",
    title: "特定商取引法表記",
    status: "ok_display",
    pathHint: "/legal/tokushoho",
    notes: "ページ表示あり。事業者情報の正確性は運営確認+専門家。",
  },
  {
    id: "pricing",
    title: "料金表示",
    status: "partial",
    pathHint: "/pricing",
    notes: "Light ¥980 等の表示あり。自動更新・税込の最終文言は専門家確認。",
  },
  {
    id: "auto_renew",
    title: "自動更新表示",
    status: "needs_legal_review",
    notes: "UI に更新説明はあるが、法的必須表示の網羅は未断定。専門家確認が必要。",
  },
  {
    id: "cancel",
    title: "解約方法",
    status: "partial",
    pathHint: "/settings/billing",
    notes: "Billing UI あり。表示の十分性は専門家確認。",
  },
  {
    id: "refund",
    title: "返金方針",
    status: "needs_legal_review",
    notes: "方針の最終確定は専門家確認が必要。コードだけでは断定しない。",
  },
  {
    id: "trial",
    title: "無料体験条件",
    status: "partial",
    notes: "trial フラグ/UI あり。条件文言の最終は専門家確認。",
  },
  {
    id: "external_consent",
    title: "外部サービス連携への同意",
    status: "partial",
    notes: "連携 UI あり。同意取得の十分性は専門家確認。外部連携は公開停止中。",
  },
  {
    id: "ai_disclosure",
    title: "AI利用に関する説明",
    status: "partial",
    notes: "プロダクト説明あり。法令上の説明義務の十分性は専門家確認。",
  },
  {
    id: "retention",
    title: "ファイル保存期間",
    status: "needs_legal_review",
    notes: "運用上の保持方針を利用規約と整合させる必要。専門家確認。",
  },
  {
    id: "data_deletion",
    title: "データ削除方法",
    status: "partial",
    notes: "サポート/設定導線を整備。完全削除の保証範囲は専門家確認。",
  },
  {
    id: "account_deletion",
    title: "アカウント削除",
    status: "partial",
    notes: "導線整備対象。法的要件は専門家確認。",
  },
  {
    id: "output_liability",
    title: "生成物の責任範囲",
    status: "needs_legal_review",
    notes: "利用規約に記載があっても最終判断は専門家。",
  },
  {
    id: "no_legal_guarantee",
    title: "法的文書の非保証",
    status: "needs_legal_review",
    notes: "専門家確認が必要。",
  },
  {
    id: "no_esign_guarantee",
    title: "電子署名の非保証",
    status: "needs_legal_review",
    notes: "専門家確認が必要。",
  },
  {
    id: "outbound_confirm",
    title: "外部投稿・送信の確認",
    status: "partial",
    notes: "外部連携は公開停止。再開時は確認 UI 必須。",
  },
  {
    id: "cookie",
    title: "Cookie・分析計測",
    status: "needs_legal_review",
    notes: "計測導入時は同意バナー要否を専門家確認。",
  },
];
