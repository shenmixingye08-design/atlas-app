import { requireAuthenticatedUserId } from "@/lib/auth/require-authenticated-user";
import { knowledgeService } from "@/lib/knowledge/knowledge-service";

export async function GET(): Promise<Response> {
  const gate = await requireAuthenticatedUserId();
  if (!gate.ok) return gate.response;

  const entries = await knowledgeService.listForUser(gate.userId);
  return Response.json({ entries, total: entries.length });
}
