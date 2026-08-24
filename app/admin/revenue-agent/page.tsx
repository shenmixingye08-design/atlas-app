import { redirect } from "next/navigation";

import { requireAtlasOwnerOrNotFound } from "@/lib/auth/require-atlas-owner";

export const dynamic = "force-dynamic";

/** Alias requested by ops. Real UI lives under /owner. */
export default async function AdminRevenueAgentPage() {
  await requireAtlasOwnerOrNotFound();
  redirect("/owner/revenue-agent");
}
