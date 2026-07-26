import { NextResponse } from "next/server";

import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import {
  listOwnerManagedUsers,
  setOwnerUserSuspended,
} from "@/lib/owner/user-admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await requireAtlasOwner();
  const { searchParams } = new URL(request.url);
  const rows = await listOwnerManagedUsers({
    query: searchParams.get("q") ?? undefined,
    planId: searchParams.get("plan") ?? undefined,
    status:
      (searchParams.get("status") as
        | "active"
        | "suspended"
        | "canceled"
        | "past_due"
        | "all"
        | null) ?? undefined,
    sort:
      (searchParams.get("sort") as
        | "registeredAt"
        | "usageCount"
        | "apiCostUsd"
        | "lastLoginAt"
        | null) ?? undefined,
    order: (searchParams.get("order") as "asc" | "desc" | null) ?? undefined,
  });
  return NextResponse.json({ users: rows, generatedAt: new Date().toISOString() });
}

export async function PATCH(request: Request) {
  await requireAtlasOwner();
  const body = (await request.json().catch(() => null)) as {
    userId?: unknown;
    suspended?: unknown;
    reason?: unknown;
  } | null;

  if (!body || typeof body.userId !== "string" || !body.userId.trim()) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }
  if (typeof body.suspended !== "boolean") {
    return NextResponse.json(
      { error: "suspended must be boolean" },
      { status: 400 },
    );
  }

  const record = await setOwnerUserSuspended({
    userId: body.userId.trim(),
    suspended: body.suspended,
    reason: typeof body.reason === "string" ? body.reason : null,
  });

  return NextResponse.json({ record });
}
