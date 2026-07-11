import { auth } from "@clerk/nextjs/server";

import { generateSalesMaterialOutline } from "@/lib/workspace/sales-material/generate-outline";
import type { SalesCostMode } from "@/lib/workspace/sales-material/types";
import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { isFeatureEnabled } from "@/lib/feature-flags/access";
import { featureDisabledMessage } from "@/lib/feature-flags/guards";

type RequestBody = {
  assignment?: unknown;
  costMode?: unknown;
};

function parseCostMode(value: unknown): SalesCostMode {
  if (value === "low" || value === "standard" || value === "high") {
    return value;
  }
  return "standard";
}

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RequestBody;

  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.assignment !== "string" || !body.assignment.trim()) {
    return Response.json(
      { error: "assignment is required and must be a non-empty string" },
      { status: 400 },
    );
  }

  const accessContext = await resolveFeatureAccessContext();
  if (!isFeatureEnabled("sales_material", accessContext)) {
    return Response.json(
      { error: featureDisabledMessage("sales_material") },
      { status: 403 },
    );
  }

  const { requireBillingAiUsage } = await import("@/lib/billing/access");
  const usageDenied = await requireBillingAiUsage(userId);
  if (usageDenied) return usageDenied;

  try {
    const { runWithAiBillingUsage } = await import(
      "@/lib/billing/usage/request-context"
    );
    const outline = await runWithAiBillingUsage(
      {
        userId,
        api: "sales_material",
        feature: "content_writing",
      },
      () =>
        generateSalesMaterialOutline(
          (body.assignment as string).trim(),
          parseCostMode(body.costMode),
        ),
    );
    return Response.json({ outline });
  } catch (error) {
    console.error("[Atlas /api/sales-material/outline]", error);
    return Response.json(
      { error: "Failed to generate sales material outline" },
      { status: 500 },
    );
  }
}
