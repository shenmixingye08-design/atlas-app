import { requireAuthenticatedUserId } from "@/lib/auth/require-authenticated-user";
import { knowledgeService } from "@/lib/knowledge/knowledge-service";
import { buildKnowledgeRetrievalResult } from "@/lib/knowledge/retrieval";
import { classifyDeliverableType } from "@/lib/orchestration/deliverable-classification";

export async function GET(request: Request): Promise<Response> {
  const gate = await requireAuthenticatedUserId();
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const workflowId = url.searchParams.get("workflowId")?.trim() ?? "preview";

  if (!query) {
    return Response.json({ error: "Query parameter q is required" }, { status: 400 });
  }

  const ranked = await knowledgeService.search({
    userId: gate.userId,
    query,
    limit: 12,
    reusableOnly: true,
  });

  const deliverableType = classifyDeliverableType(query);
  const retrieval = buildKnowledgeRetrievalResult(
    query,
    workflowId,
    ranked,
    deliverableType,
  );

  return Response.json(retrieval);
}
