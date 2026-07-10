import { knowledgeService } from "@/lib/knowledge/knowledge-service";

export async function GET(): Promise<Response> {
  const entries = await knowledgeService.list();
  return Response.json({ entries, total: entries.length });
}
