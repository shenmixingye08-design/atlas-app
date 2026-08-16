import "server-only";

import { auth } from "@clerk/nextjs/server";
import { connection } from "next/server";

import { getClerkUserPrimaryEmail } from "./get-clerk-user-email";
import {
  assertOwnerEmailsConfiguredForProduction,
  isAtlasOwnerEmail,
} from "./is-atlas-owner";

export type OwnerAccessDecision =
  | { status: "ok"; email: string }
  | { status: "unauthenticated" }
  | { status: "forbidden" };

/** Pure Owner gate — used by pages, APIs, and tests. */
export function decideOwnerAccess(input: {
  userId: string | null | undefined;
  email: string | null | undefined;
}): OwnerAccessDecision {
  if (!input.userId) return { status: "unauthenticated" };
  if (!isAtlasOwnerEmail(input.email)) return { status: "forbidden" };
  return { status: "ok", email: input.email! };
}

export function ownerAccessJsonResponse(
  decision: Exclude<OwnerAccessDecision, { status: "ok" }>,
): Response {
  if (decision.status === "unauthenticated") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json({ error: "Forbidden" }, { status: 403 });
}

export async function resolveOwnerAccess(): Promise<OwnerAccessDecision> {
  await connection();
  assertOwnerEmailsConfiguredForProduction();

  const { userId } = await auth();
  if (!userId) return { status: "unauthenticated" };

  const email = await getClerkUserPrimaryEmail(userId);
  return decideOwnerAccess({ userId, email });
}
