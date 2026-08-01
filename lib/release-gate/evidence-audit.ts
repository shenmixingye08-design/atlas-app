import { existsSync, readFileSync } from "fs";
import { join } from "path";

import type { PhaseEvidenceAudit, ReleaseFinding } from "./types";

function readJson(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Phase1–6 evidence re-audit. Local-only / n insufficient / no prod ⇒ honestPass=false.
 */
export function auditPastPhases(
  artifactsRoot = "/opt/cursor/artifacts"
): PhaseEvidenceAudit[] {
  const vision = readJson(join(artifactsRoot, "vision-phase1/latest.json"));
  const art = readJson(
    join(artifactsRoot, "artifact-durability/latest.json")
  );
  const ops = readJson(join(artifactsRoot, "ops-durability/latest.json"));
  const rb = readJson(join(artifactsRoot, "release-blocker/latest.json"));
  const va = readJson(join(artifactsRoot, "value-audit-phase5/latest.json"));
  const beta = readJson(join(artifactsRoot, "beta-ux-phase6/latest.json"));

  const visionRate =
    typeof vision?.visionSuccessRate === "number"
      ? vision.visionSuccessRate
      : null;
  const visionN = typeof vision?.n === "number" ? vision.n : null;

  const totals = (art?.totals ?? null) as
    | Record<string, { n?: number; finalRate?: number; p95Ms?: number }>
    | null;
  const docxN = totals?.docx?.n ?? null;
  const docxRate = totals?.docx?.finalRate ?? null;
  const docxP95 = totals?.docx?.p95Ms ?? null;

  const jobs = (ops?.jobs ?? null) as {
    n?: number;
    completedRate?: number;
    p95Ms?: number;
  } | null;
  const pushRate =
    typeof (ops?.notifications as { pushRate?: number } | undefined)
      ?.pushRate === "number"
      ? (ops!.notifications as { pushRate: number }).pushRate
      : null;

  return [
    {
      phase: "1",
      title: "Vision/OCR",
      conducted: Boolean(vision),
      production: false,
      sampleSize: visionN,
      hasRequestIds: Boolean(vision?.suiteId),
      hasScreenshots: false,
      successRate: visionRate,
      p95Ms: null,
      failuresSaved: true,
      retestAfterFix: false,
      claimedPass: vision?.phase1Pass === true,
      honestPass: false,
      notes: `本番未実施。successRate=${visionRate}（APIキーなしで0）。ローカル/モック成功はPASS不可`,
    },
    {
      phase: "2",
      title: "成果物耐久 Word/Excel/PDF/PPTX",
      conducted: Boolean(art),
      production: false,
      sampleSize: docxN,
      hasRequestIds: Boolean(art?.suiteId),
      hasScreenshots: false,
      successRate: docxRate,
      p95Ms: docxP95,
      failuresSaved: true,
      retestAfterFix: true,
      claimedPass: art?.phase2Pass === true,
      honestPass: false,
      notes:
        "ローカルn=100で最終成功率高だが本番E2E≥20/format未達のためphase2Pass=false",
    },
    {
      phase: "3",
      title: "Jobs/通知/Storage/外部",
      conducted: Boolean(ops),
      production: false,
      sampleSize: jobs?.n ?? null,
      hasRequestIds: Boolean(ops?.suiteId),
      hasScreenshots: false,
      successRate: jobs?.completedRate ?? null,
      p95Ms: jobs?.p95Ms ?? null,
      failuresSaved: true,
      retestAfterFix: true,
      claimedPass: ops?.phase3Pass === true,
      honestPass: false,
      notes: `Push成功率=${pushRate}（VAPID未設定）。外部未接続。本番未検証`,
    },
    {
      phase: "4",
      title: "Release Blocker / 権限・課金",
      conducted: Boolean(rb),
      production: rb?.productionE2eVerified === true,
      sampleSize: 100,
      hasRequestIds: Boolean(rb?.suiteId),
      hasScreenshots: false,
      successRate: rb?.authzFixed === true ? 1 : 0,
      p95Ms: null,
      failuresSaved: true,
      retestAfterFix: true,
      claimedPass: rb?.releaseReady === true,
      honestPass: false,
      notes: `criticalOpen=${rb?.criticalOpen} productionE2e=${rb?.productionE2eVerified}`,
    },
    {
      phase: "5",
      title: "差別化・980円価値",
      conducted: Boolean(va),
      production: va?.productionDemosOk === true,
      sampleSize: typeof va?.coreUseCases === "number" ? va.coreUseCases : null,
      hasRequestIds: Boolean(va?.suiteId),
      hasScreenshots: false,
      successRate: va?.localDemosOk === true ? 1 : 0,
      p95Ms: null,
      failuresSaved: true,
      retestAfterFix: false,
      claimedPass: va?.phase5Pass === true,
      honestPass: false,
      notes: "ローカルデモ可。本番デモ不可。publishValueYes=false",
    },
    {
      phase: "6",
      title: "実ユーザーβ",
      conducted: Boolean(beta),
      production: false,
      sampleSize:
        typeof beta?.testerCount === "number" ? beta.testerCount : 0,
      hasRequestIds: Boolean(beta?.suiteId),
      hasScreenshots: false,
      successRate: null,
      p95Ms: null,
      failuresSaved: true,
      retestAfterFix: false,
      claimedPass: beta?.phase6Pass === true,
      honestPass: false,
      notes: `testerCount=${beta?.testerCount ?? 0}。n<10は確定評価禁止`,
    },
  ];
}

export function buildReleaseFindings(
  phases: PhaseEvidenceAudit[]
): ReleaseFinding[] {
  const findings: ReleaseFinding[] = [];

  findings.push({
    id: "production_e2e_unverified",
    severity: "Critical",
    title: "本番E2E未検証",
    area: "sre",
    evidence: "Phase1–6いずれも production=false または productionE2eVerified=false",
    status: "open",
    blocksRelease: true,
  });

  findings.push({
    id: "beta_users_missing",
    severity: "Critical",
    title: "実ユーザーβ未達（n≥10）",
    area: "ux",
    evidence: `Phase6 testerCount=${
      phases.find((p) => p.phase === "6")?.sampleSize ?? 0
    }`,
    status: "open",
    blocksRelease: true,
  });

  findings.push({
    id: "vision_production_unproven",
    severity: "Critical",
    title: "Vision本番成功率未達",
    area: "vision",
    evidence: `Phase1 successRate=${
      phases.find((p) => p.phase === "1")?.successRate
    }`,
    status: "open",
    blocksRelease: true,
  });

  findings.push({
    id: "push_email_unverified",
    severity: "High",
    title: "Push未検証 / Email通知未実装",
    area: "notifications",
    evidence: "Phase3 pushRate=0; email channel missing → capability 非表示でユーザー提供しない",
    status: "accepted_with_hide",
    blocksRelease: false,
  });

  findings.push({
    id: "external_integrations_unverified",
    severity: "High",
    title: "外部連携E2E未接続",
    area: "integrations",
    evidence: "X/Gmail/Calendar/WP/Dropbox not proven → 非表示 + Kill Switch可",
    status: "accepted_with_hide",
    blocksRelease: false,
  });

  findings.push({
    id: "artifact_prod_unverified",
    severity: "High",
    title: "成果物本番E2E未達（ローカルのみ高成功率）",
    area: "deliverables",
    evidence: "Phase2 local n=100 ok; production samples 0 → GAせず招待制に限定",
    status: "accepted_with_hide",
    blocksRelease: false,
  });

  findings.push({
    id: "stripe_durable_claim",
    severity: "High",
    title: "Stripe webhook durable CAS未完",
    area: "billing",
    evidence: "in-process claim only (Phase4 mitigated)",
    status: "mitigated",
    blocksRelease: false,
  });

  findings.push({
    id: "rate_limit_memory",
    severity: "High",
    title: "Rate limitがプロセスローカル",
    area: "abuse",
    evidence: "Phase4 mitigated",
    status: "mitigated",
    blocksRelease: false,
  });

  findings.push({
    id: "backup_full_restore_unproven",
    severity: "High",
    title: "フルDB/Storage復元未実測",
    area: "dr",
    evidence: "ops-state DRのみ。ユーザー成果物PITR未証明",
    status: "open",
    blocksRelease: false,
  });

  findings.push({
    id: "legal_expert_review",
    severity: "Medium",
    title: "法務ページは存在するが専門家確認未実施",
    area: "legal",
    evidence: "/terms /privacy /legal あり。弁護士レビュー未確認",
    status: "open",
    blocksRelease: false,
  });

  findings.push({
    id: "faq_support_gap",
    severity: "Medium",
    title: "FAQ/診断ID一般導線が弱い",
    area: "support",
    evidence: "contactあり。汎用FAQはPhase7で追加",
    status: "mitigated",
    blocksRelease: false,
  });

  findings.push({
    id: "copy_polish",
    severity: "Low",
    title: "文言・装飾の継続改善",
    area: "ux",
    evidence: "非ブロッカー",
    status: "open",
    blocksRelease: false,
  });

  return findings;
}
