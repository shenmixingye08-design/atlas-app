export type ArtifactDurabilityEnv = {
  productionE2eBaseUrl: string | null;
  productionUrlGuess: string;
  clerkSecret: boolean;
  clerkPublishable: boolean;
  supabaseUrl: boolean;
  supabaseServiceRole: boolean;
  cronSecret: boolean;
  canRunLocal: boolean;
  canRunProductionHttp: boolean;
  blockers: string[];
  setupSteps: string[];
};

export function inspectArtifactDurabilityEnv(
  env: NodeJS.ProcessEnv = process.env
): ArtifactDurabilityEnv {
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
  const cronSecret = Boolean(env.CRON_SECRET?.trim());

  const canRunLocal = true; // generators need no OpenAI
  const canRunProductionHttp = Boolean(
    productionE2eBaseUrl && cronSecret && clerkSecret
  );

  const blockers: string[] = [];
  if (!productionE2eBaseUrl) {
    blockers.push(
      "PRODUCTION_E2E_BASE_URL unset — cannot run required 20 production cases per format"
    );
  }
  if (!clerkSecret || !clerkPublishable) {
    blockers.push("Clerk keys missing — authenticated production APIs unavailable");
  }
  if (!supabaseUrl || !supabaseServiceRole) {
    blockers.push(
      "Supabase missing — production durable Storage verification unavailable"
    );
  }
  if (!cronSecret) {
    blockers.push("CRON_SECRET missing — internal production eval API unavailable");
  }

  const setupSteps = [
    "本番20件/形式 のために Environment Secrets を設定（値はPR・ログへ貼らない）:",
    `  PRODUCTION_E2E_BASE_URL=${productionUrlGuess}`,
    "  CRON_SECRET=<Vercelと同じ>",
    "  CLERK_SECRET_KEY / NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    "  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY",
    "ローカル400件: npm run test:artifact-durability（OpenAI不要）",
    "本番: PRODUCTION_E2E_BASE_URL + CRON_SECRET 設定後に再実行",
  ];

  return {
    productionE2eBaseUrl,
    productionUrlGuess,
    clerkSecret,
    clerkPublishable,
    supabaseUrl,
    supabaseServiceRole,
    cronSecret,
    canRunLocal,
    canRunProductionHttp,
    blockers,
    setupSteps,
  };
}
