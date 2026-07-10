/**
 * Pipeline trace via /api/orchestrate (works without importing server-only modules).
 * Run: npm run dev (separate terminal), then: npx tsx scripts/trace-workflow.ts
 */
const PROMPT =
  "ブログを毎日投稿してほしい。最近のトレンドから一番見られそうなトピックを選び、SEOを意識した記事を書いてください。";

const BASE_URL = process.env.ATLAS_TRACE_URL ?? "http://localhost:3000";

function previewText(deliverable: unknown): string {
  if (typeof deliverable === "string") return deliverable.trim();
  if (deliverable && typeof deliverable === "object") {
    const record = deliverable as Record<string, unknown>;
    return (
      (typeof record.markdown === "string" ? record.markdown : "") ||
      (typeof record.content === "string" ? record.content : "") ||
      (typeof record.plainText === "string" ? record.plainText : "")
    ).trim();
  }
  return "";
}

async function main(): Promise<void> {
  console.log("=== ATLAS Workflow Trace ===");
  console.log("Prompt:", PROMPT);
  console.log("Endpoint:", `${BASE_URL}/api/orchestrate`);
  console.log("");

  const response = await fetch(`${BASE_URL}/api/orchestrate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assignment: PROMPT }),
  });

  const result = (await response.json()) as Record<string, unknown>;

  if (!response.ok && !("executions" in result)) {
    throw new Error(`Orchestrate failed: ${response.status} ${JSON.stringify(result)}`);
  }

  const research = result.research as Record<string, unknown> | undefined;
  const report = research?.report as Record<string, unknown> | undefined;
  const researchOut =
    (typeof report?.fullText === "string" && report.fullText) ||
    (typeof report?.executiveSummary === "string" && report.executiveSummary) ||
    "(empty)";

  const plannerPlan = result.plannerPlan as Record<string, unknown> | undefined;
  const plannerTasks = result.plannerTasks as Record<string, unknown> | undefined;
  const plannerOut = [
    (plannerPlan?.result as Record<string, unknown> | undefined)?.outputText,
    (plannerTasks?.result as Record<string, unknown> | undefined)?.outputText,
  ]
    .filter((value): value is string => typeof value === "string")
    .join("\n\n---\n\n");

  const executions = Array.isArray(result.executions) ? result.executions : [];
  const workerOut = executions
    .map((exec, index) => {
      const row = exec as Record<string, unknown>;
      const task = row.task as Record<string, unknown> | undefined;
      const worker = row.worker as Record<string, unknown> | undefined;
      const workerResult = worker?.result as Record<string, unknown> | undefined;
      return `# Worker ${index + 1} (task ${task?.id}: ${task?.title})\nstatus=${row.workerStatus}\n${workerResult?.outputText ?? "(empty)"}`;
    })
    .join("\n\n---\n\n");

  const deliverable = result.deliverable;
  const deliverablePreview = previewText(deliverable);

  console.log("--- Research Output ---");
  console.log(String(researchOut).slice(0, 1200));
  console.log("");

  console.log("--- Planner Output ---");
  console.log(plannerOut.slice(0, 1200) || "(empty)");
  console.log("");

  console.log("--- Worker Output ---");
  console.log(workerOut.slice(0, 2000) || "(empty)");
  console.log("");

  console.log("--- Deliverable ---");
  console.log("status:", result.status);
  console.log("approved:", result.approved);
  if (deliverable && typeof deliverable === "object") {
    const d = deliverable as Record<string, unknown>;
    console.log("deliverable.kind:", d.kind);
    console.log("deliverable.title:", d.title);
  }
  console.log("deliverable.content.length:", deliverablePreview.length);
  console.log(deliverablePreview.slice(0, 2000) || "(empty)");
  console.log("");

  console.log("--- Workspace Result ---");
  console.log(
    JSON.stringify(
      {
        status: result.status,
        approved: result.approved,
        finalResponse: result.finalResponse,
        deliverable,
        workerCount: executions.length,
        error: result.error ?? null,
      },
      null,
      2,
    ),
  );
  console.log("");

  console.log("--- Rendered UI ---");
  console.log(
    deliverablePreview.length > 0
      ? "FinalOutput WOULD render 成果物 preview card"
      : "FinalOutput WOULD render empty-state card",
  );
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
