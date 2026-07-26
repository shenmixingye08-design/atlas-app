import { AiAssistantDashboard } from "@/components/owner/ai-assistant/ai-assistant-dashboard";
import { OwnerShell } from "@/components/owner/owner-shell";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import {
  getAiAssistantSnapshot,
  type AssistantPeriod,
} from "@/lib/owner/ai-assistant";

export const dynamic = "force-dynamic";

function parsePeriod(value: string | string[] | undefined): AssistantPeriod {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "day" || raw === "week" || raw === "month") return raw;
  return "month";
}

export default async function OwnerAiAssistantPage({
  searchParams,
}: {
  searchParams?: Promise<{ period?: string }>;
}) {
  await requireAtlasOwner();
  const params = searchParams ? await searchParams : {};
  const period = parsePeriod(params.period);
  const snapshot = await getAiAssistantSnapshot({ period, refreshAi: false });

  return (
    <OwnerShell active="aiAssistant">
      <AiAssistantDashboard snapshot={snapshot} />
    </OwnerShell>
  );
}
