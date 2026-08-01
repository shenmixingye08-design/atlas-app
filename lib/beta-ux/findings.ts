import type { BetaFinding } from "./types";

/**
 * Known High/Critical from prior phases + first-run UX risks.
 * Updated after real β; until then marked open with evidence of absence of real users.
 */
export function defaultBetaFindings(input: {
  realTesterCount: number;
  productionE2e: boolean;
}): BetaFinding[] {
  const findings: BetaFinding[] = [
    {
      id: "beta_real_users_missing",
      severity: "Critical",
      title: "実ユーザーβ（n≥10）未実施",
      evidence: `実テスター数=${input.realTesterCount}`,
      status: input.realTesterCount >= 10 ? "fixed" : "open",
      dropoutReason: "unknown",
    },
    {
      id: "beta_production_parity_unverified",
      severity: "Critical",
      title: "本番同等環境での完遂未証明",
      evidence: input.productionE2e
        ? "PRODUCTION_E2E configured"
        : "PRODUCTION_E2E secrets missing",
      status: input.productionE2e ? "mitigated" : "open",
    },
    {
      id: "first_run_purpose_clarity",
      severity: "High",
      title: "初回ホームで『実ファイルまで』が伝わるか未実測",
      evidence: "Phase5でコピー改善済。実ユーザー説明なしテスト未実施",
      status: "mitigated",
      dropoutReason: "service_purpose_unclear",
    },
    {
      id: "receipt_expectation_gap",
      severity: "High",
      title: "家計簿追記期待と実装ギャップ",
      evidence: "家計簿モジュール未実装。コピーでExcel整理に限定済み",
      status: "mitigated",
      dropoutReason: "user_expected_different_output",
    },
    {
      id: "progress_clarity",
      severity: "High",
      title: "処理中の進捗理解不足リスク",
      evidence: "workspace進捗UIは存在。説明なし実測なし",
      status: "open",
      dropoutReason: "progress_unclear",
    },
    {
      id: "download_discovery",
      severity: "High",
      title: "ダウンロード導線の発見しやすさ未実測",
      evidence: "完了後CTA強化を実装。n<10",
      status: "mitigated",
      dropoutReason: "download_unclear",
    },
    {
      id: "mobile_nav",
      severity: "Medium",
      title: "モバイル初回完遂未実測",
      evidence: "bottom navあり。実機βなし",
      status: "open",
      dropoutReason: "mobile_layout_problem",
    },
    {
      id: "email_notification_gap",
      severity: "Medium",
      title: "Email通知なしで完了認知が弱い可能性",
      evidence: "Email channel unimplemented",
      status: "open",
      dropoutReason: "notification_missed",
    },
  ];
  return findings;
}
