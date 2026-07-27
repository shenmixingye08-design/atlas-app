import "server-only";

import { checkAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { getClerkUserPrimaryEmail } from "@/lib/auth/get-clerk-user-email";
import { probeDeliverableStorage } from "@/lib/deliverables/object-storage";
import { getWordMetricsSnapshot } from "@/lib/deliverables/word-metrics";
import { resolveDeliverableStorageBackend } from "@/lib/deliverables/storage-backend";
import { ATLAS_DELIVERABLE_FILES_BUCKET } from "@/lib/deliverables/constants";
import { getSupabaseServiceRoleEnv } from "@/lib/supabase/env";

export type WordDiagnosticsEnv = {
  key: string;
  configured: boolean;
  requirement: "required" | "recommended" | "optional";
  purpose: string;
  productionRisk: string | null;
};

export async function buildWordDiagnosticsOverview(input: {
  userId: string | null;
}): Promise<{
  ok: boolean;
  isOwner: boolean;
  userId: string | null;
  userEmailHost: string | null;
  storage: Awaited<ReturnType<typeof probeDeliverableStorage>>;
  metrics: ReturnType<typeof getWordMetricsSnapshot>;
  env: WordDiagnosticsEnv[];
  warnings: Array<{ severity: "critical" | "warn"; message: string }>;
  androidUnverified: string[];
}> {
  const isOwner = await checkAtlasOwner();
  if (!isOwner) {
    return {
      ok: false,
      isOwner: false,
      userId: null,
      userEmailHost: null,
      storage: {
        backend: resolveDeliverableStorageBackend(),
        required: false,
        serviceRoleConfigured: false,
        bucket: ATLAS_DELIVERABLE_FILES_BUCKET,
        bucketExists: false,
        ready: false,
        warning: "owner_only",
        severity: "critical",
      },
      metrics: getWordMetricsSnapshot(),
      env: [],
      warnings: [{ severity: "critical", message: "管理者のみ閲覧できます。" }],
      androidUnverified: [],
    };
  }

  const storage = await probeDeliverableStorage();
  const metrics = getWordMetricsSnapshot();
  const supabase = getSupabaseServiceRoleEnv();

  const env: WordDiagnosticsEnv[] = [
    {
      key: "SUPABASE_URL",
      configured: Boolean(supabase?.url),
      requirement: "required",
      purpose: "成果物メタデータ / Storage",
      productionRisk: supabase?.url
        ? null
        : "未設定時、Vercel別インスタンスでWord取得不能",
    },
    {
      key: "SUPABASE_SERVICE_ROLE_KEY",
      configured: Boolean(supabase?.serviceRoleKey),
      requirement: "required",
      purpose: "atlas_deliverable_files / Storage 書き込み",
      productionRisk: supabase?.serviceRoleKey
        ? null
        : "本番で永続保存不可（重大）",
    },
    {
      key: "ATLAS_DELIVERABLE_STORAGE",
      configured: Boolean(process.env.ATLAS_DELIVERABLE_STORAGE),
      requirement: "optional",
      purpose: "local / supabase 強制。Vercel production/preview は常に supabase",
      productionRisk:
        process.env.ATLAS_DELIVERABLE_STORAGE === "local" &&
        (process.env.VERCEL_ENV === "production" ||
          process.env.VERCEL_ENV === "preview")
          ? "本番で local 指定は無視されますが設定ミスの兆候です"
          : null,
    },
    {
      key: "ATLAS_OWNER_EMAILS",
      configured: Boolean(process.env.ATLAS_OWNER_EMAILS?.trim()),
      requirement: "required",
      purpose: "管理者診断画面の許可",
      productionRisk: null,
    },
    {
      key: "CLERK_SECRET_KEY",
      configured: Boolean(process.env.CLERK_SECRET_KEY),
      requirement: "required",
      purpose: "認証 Cookie / ダウンロード認可",
      productionRisk: null,
    },
  ];

  const warnings: Array<{ severity: "critical" | "warn"; message: string }> = [];
  if (storage.severity === "critical" && storage.warning) {
    warnings.push({ severity: "critical", message: storage.warning });
  } else if (storage.severity === "warn" && storage.warning) {
    warnings.push({ severity: "warn", message: storage.warning });
  }
  for (const item of env) {
    if (item.productionRisk) {
      warnings.push({ severity: "critical", message: `${item.key}: ${item.productionRisk}` });
    }
  }

  let userEmailHost: string | null = null;
  if (input.userId) {
    const email = await getClerkUserPrimaryEmail(input.userId);
    if (email?.includes("@")) {
      userEmailHost = email.split("@")[1] ?? null;
    }
  }

  return {
    ok: true,
    isOwner: true,
    userId: input.userId,
    userEmailHost,
    storage,
    metrics,
    env,
    warnings,
    androidUnverified: [
      "Android Chrome 実機でのタップ→ダウンロード完了",
      "Android WebView / アプリ内ブラウザでの Cookie 送信",
      "Microsoft Word モバイルでの実ファイル表示",
      "Google ドキュメントでの実ファイルインポート",
    ],
  };
}
