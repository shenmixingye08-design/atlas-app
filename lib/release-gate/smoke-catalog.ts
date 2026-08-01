/**
 * Production smoke catalog. Cases for non-GA / hidden features are marked skip.
 */

import { decidePublishScope } from "./publish-scope";
import type { CapabilityId, PublishScope } from "./types";

export type SmokeCaseId =
  | "signup"
  | "login"
  | "word"
  | "excel"
  | "pdf"
  | "powerpoint"
  | "vision"
  | "image_to_excel"
  | "word_to_pdf"
  | "excel_to_pdf"
  | "preview"
  | "download"
  | "revise"
  | "revision"
  | "notify"
  | "x_post"
  | "gmail"
  | "gcal"
  | "automation"
  | "billing_start"
  | "billing_cancel"
  | "account_delete";

export type SmokeCasePlan = {
  caseId: SmokeCaseId;
  capability?: CapabilityId;
  requiredForGa: boolean;
  execute: boolean;
  skipReason: string | null;
};

function scopeOf(id: CapabilityId): PublishScope {
  return decidePublishScope().find((d) => d.id === id)?.scope ?? "未公開";
}

function isPublicFacing(scope: PublishScope): boolean {
  return scope === "GA公開" || scope === "β公開" || scope === "招待制";
}

export function planSmokeCases(): SmokeCasePlan[] {
  const rows: Array<{
    caseId: SmokeCaseId;
    capability?: CapabilityId;
    requiredForGa: boolean;
  }> = [
    { caseId: "signup", capability: "signup", requiredForGa: true },
    { caseId: "login", requiredForGa: true },
    { caseId: "word", capability: "word", requiredForGa: true },
    { caseId: "excel", capability: "excel", requiredForGa: true },
    { caseId: "pdf", capability: "pdf", requiredForGa: true },
    { caseId: "powerpoint", capability: "powerpoint", requiredForGa: true },
    { caseId: "vision", capability: "vision", requiredForGa: true },
    { caseId: "image_to_excel", capability: "image_to_excel", requiredForGa: false },
    { caseId: "word_to_pdf", capability: "convert", requiredForGa: true },
    { caseId: "excel_to_pdf", capability: "convert", requiredForGa: true },
    { caseId: "preview", capability: "word", requiredForGa: true },
    { caseId: "download", capability: "word", requiredForGa: true },
    { caseId: "revise", capability: "revise", requiredForGa: true },
    { caseId: "revision", capability: "revision", requiredForGa: true },
    { caseId: "notify", capability: "push", requiredForGa: true },
    { caseId: "x_post", capability: "x_post", requiredForGa: false },
    { caseId: "gmail", capability: "gmail", requiredForGa: false },
    { caseId: "gcal", capability: "gcal", requiredForGa: false },
    { caseId: "automation", capability: "automation", requiredForGa: false },
    { caseId: "billing_start", capability: "billing", requiredForGa: true },
    { caseId: "billing_cancel", capability: "billing", requiredForGa: true },
    { caseId: "account_delete", requiredForGa: true },
  ];

  return rows.map((row) => {
    if (!row.capability) {
      return {
        ...row,
        execute: false,
        skipReason: "本番環境未接続のためエージェントでは未実行",
      };
    }
    const scope = scopeOf(row.capability);
    if (!isPublicFacing(scope) && scope !== "管理者のみ") {
      return {
        ...row,
        execute: false,
        skipReason: `公開対象外（scope=${scope}）。UI非表示/停止前提`,
      };
    }
    return {
      ...row,
      execute: false,
      skipReason:
        "本番Smoke未実行（PRODUCTION_E2E_BASE_URL未設定または認証不足）。偽成功にしない",
    };
  });
}

export type SmokeCaseResult = SmokeCasePlan & {
  request_id: string | null;
  jobId: string | null;
  artifactId: string | null;
  externalActionId: string | null;
  durationMs: number | null;
  screenshotPath: string | null;
  logPath: string | null;
  ok: boolean | null;
  failureReason: string | null;
};
