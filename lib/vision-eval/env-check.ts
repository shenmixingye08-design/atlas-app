export type VisionEvalEnvReport = {
  openaiApiKey: boolean;
  qualityLiveVision: boolean;
  productionE2eBaseUrl: string | null;
  productionUrlGuess: string | null;
  clerkSecret: boolean;
  clerkPublishable: boolean;
  supabaseUrl: boolean;
  supabaseServiceRole: boolean;
  attachmentStorage: string | null;
  atlasMockLlm: boolean;
  cronSecret: boolean;
  canRunLocalLiveProvider: boolean;
  canRunProductionHttp: boolean;
  blockers: string[];
  setupSteps: string[];
};

/**
 * Inspect measurement environment without printing secret values.
 */
export function inspectVisionEvalEnv(
  env: NodeJS.ProcessEnv = process.env
): VisionEvalEnvReport {
  const openaiApiKey = Boolean(env.OPENAI_API_KEY?.trim());
  const qualityLiveVision = env.QUALITY_LIVE_VISION === "1";
  const productionE2eBaseUrl = env.PRODUCTION_E2E_BASE_URL?.trim() || null;
  const productionUrlGuess =
    env.NEXT_PUBLIC_SITE_URL?.trim() ||
    env.NEXT_PUBLIC_APP_URL?.trim() ||
    "https://atlas-two-blush-43.vercel.app";
  const clerkSecret = Boolean(env.CLERK_SECRET_KEY?.trim());
  const clerkPublishable = Boolean(
    env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim()
  );
  const supabaseUrl = Boolean(
    env.SUPABASE_URL?.trim() || env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  );
  const supabaseServiceRole = Boolean(env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  const attachmentStorage = env.ATLAS_ATTACHMENT_STORAGE?.trim() || null;
  const atlasMockLlm = env.ATLAS_MOCK_LLM === "true";
  const cronSecret = Boolean(env.CRON_SECRET?.trim());

  const canRunLocalLiveProvider = openaiApiKey && !atlasMockLlm && qualityLiveVision;
  const canRunProductionHttp = Boolean(
    productionE2eBaseUrl && cronSecret && qualityLiveVision
  );

  const blockers: string[] = [];
  if (!openaiApiKey) blockers.push("OPENAI_API_KEY missing");
  if (!qualityLiveVision) blockers.push("QUALITY_LIVE_VISION!=1 (spend gate)");
  if (atlasMockLlm) blockers.push("ATLAS_MOCK_LLM=true (refusing live)");
  if (!productionE2eBaseUrl) {
    blockers.push("PRODUCTION_E2E_BASE_URL unset (HTTP production path unavailable)");
  }
  if (!clerkSecret || !clerkPublishable) {
    blockers.push("Clerk keys missing (authenticated /api/vision/analyze path unavailable)");
  }
  if (!supabaseUrl || !supabaseServiceRole) {
    blockers.push(
      "Supabase missing (production storage path unavailable; local-live uses memory/local)"
    );
  }

  const setupSteps = [
    "Cursor Cloud / ローカルの Environment Secrets に次を設定（値はチャット・PR・ログへ貼らない）:",
    "  OPENAI_API_KEY=<OpenAI secret key>",
    "  QUALITY_LIVE_VISION=1",
    "  ATLAS_ATTACHMENT_STORAGE=local",
    "  ATLAS_MOCK_LLM を true にしない",
    "本番HTTP経路を使う場合の追加:",
    `  PRODUCTION_E2E_BASE_URL=${productionUrlGuess}`,
    "  CRON_SECRET=<Vercel と同じ CRON_SECRET>",
    "  （任意）Clerk テストユーザーで UI スクリーンショット",
    "設定後: npm run test:vision-phase1",
    "コスト注意: 100件の実 Vision 呼び出しが発生します。承認後のみ実行。",
  ];

  return {
    openaiApiKey,
    qualityLiveVision,
    productionE2eBaseUrl,
    productionUrlGuess,
    clerkSecret,
    clerkPublishable,
    supabaseUrl,
    supabaseServiceRole,
    attachmentStorage,
    atlasMockLlm,
    cronSecret,
    canRunLocalLiveProvider,
    canRunProductionHttp,
    blockers,
    setupSteps,
  };
}
