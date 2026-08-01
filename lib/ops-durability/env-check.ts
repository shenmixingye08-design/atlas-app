export type OpsDurabilityEnv = {
  productionE2eBaseUrl: string | null;
  productionUrlGuess: string;
  openai: boolean;
  clerk: boolean;
  supabase: boolean;
  cronSecret: boolean;
  vapid: boolean;
  canRunLocal: boolean;
  canRunProductionHttp: boolean;
  blockers: string[];
  setupSteps: string[];
};

export function inspectOpsDurabilityEnv(
  env: NodeJS.ProcessEnv = process.env
): OpsDurabilityEnv {
  const productionE2eBaseUrl = env.PRODUCTION_E2E_BASE_URL?.trim() || null;
  const productionUrlGuess =
    env.NEXT_PUBLIC_SITE_URL?.trim() ||
    env.NEXT_PUBLIC_APP_URL?.trim() ||
    "https://atlas-two-blush-43.vercel.app";
  const openai = Boolean(env.OPENAI_API_KEY?.trim());
  const clerk = Boolean(env.CLERK_SECRET_KEY?.trim());
  const supabase = Boolean(
    (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL)?.trim() &&
      env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  );
  const cronSecret = Boolean(env.CRON_SECRET?.trim());
  const vapid = Boolean(
    env.VAPID_PUBLIC_KEY?.trim() && env.VAPID_PRIVATE_KEY?.trim()
  );

  const canRunProductionHttp = Boolean(
    productionE2eBaseUrl && cronSecret && clerk && supabase
  );

  const blockers: string[] = [];
  if (!productionE2eBaseUrl) {
    blockers.push("PRODUCTION_E2E_BASE_URL unset");
  }
  if (!clerk) blockers.push("Clerk secrets missing");
  if (!supabase) blockers.push("Supabase missing for durable Storage/jobs");
  if (!cronSecret) blockers.push("CRON_SECRET missing");
  if (!vapid) blockers.push("VAPID missing — real Push E2E unavailable");
  if (!openai) blockers.push("OPENAI_API_KEY missing — vision jobs excluded from success denom");

  return {
    productionE2eBaseUrl,
    productionUrlGuess,
    openai,
    clerk,
    supabase,
    cronSecret,
    vapid,
    canRunLocal: true,
    canRunProductionHttp,
    blockers,
    setupSteps: [
      "Set PRODUCTION_E2E_BASE_URL, CRON_SECRET, Clerk, Supabase, VAPID",
      "Connect test accounts: X / Gmail / Calendar / WordPress / Dropbox",
      "npm run test:ops-durability:full",
    ],
  };
}
