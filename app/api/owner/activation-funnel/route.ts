import { requireAtlasOwnerApi } from "@/lib/auth/require-atlas-owner";
import { listActivationEventRows } from "@/lib/activation/events-table";
import { buildActivationFunnel } from "@/lib/activation/funnel";
import { listAllActivationEvents } from "@/lib/activation/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const owner = await requireAtlasOwnerApi();
  if (!owner.ok) return owner.response;

  const url = new URL(request.url);
  const to = url.searchParams.get("to") ?? new Date().toISOString();
  const fromDefault = new Date(Date.parse(to) || Date.now());
  fromDefault.setUTCDate(fromDefault.getUTCDate() - 30);
  const from = url.searchParams.get("from") ?? fromDefault.toISOString();

  const stored = await listActivationEventRows({ from, to });
  const memory = listAllActivationEvents();
  const byKey = new Map<string, (typeof stored)[number]>();
  for (const event of [...memory, ...stored]) {
    byKey.set(`${event.userId}:${event.event}:${event.idempotencyKey}`, event);
  }

  return Response.json({
    funnel: buildActivationFunnel([...byKey.values()], { from, to }),
  });
}
