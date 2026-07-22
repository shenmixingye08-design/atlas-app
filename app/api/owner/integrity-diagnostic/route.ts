import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { buildIntegrityDiagnosticSnapshot } from "@/lib/jobs/integrity-diagnostic";

/** Owner-only read-only integrity scan — no auto-delete. */
export async function GET(): Promise<Response> {
  await requireAtlasOwner();
  const snapshot = await buildIntegrityDiagnosticSnapshot();
  return Response.json(snapshot);
}
