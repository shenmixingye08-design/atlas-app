import "server-only";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { getClerkUserPrimaryEmail } from "./get-clerk-user-email";
import { isAtlasOwnerEmail } from "./is-atlas-owner";
import {
  ownerAccessJsonResponse,
  resolveOwnerAccess,
} from "./owner-access";

export async function requireAtlasOwner(): Promise<{ email: string }> {
  const decision = await resolveOwnerAccess();

  if (decision.status === "unauthenticated") {
    redirect("/sign-in");
  }

  if (decision.status === "forbidden") {
    redirect("/");
  }

  return { email: decision.email };
}

/** API routes: 401 / 403 JSON. Never redirect a caller into the Owner UI. */
export async function requireAtlasOwnerApi(): Promise<
  { ok: true; email: string } | { ok: false; response: Response }
> {
  const decision = await resolveOwnerAccess();
  if (decision.status !== "ok") {
    return { ok: false, response: ownerAccessJsonResponse(decision) };
  }
  return { ok: true, email: decision.email };
}

export async function checkAtlasOwner(): Promise<boolean> {
  const { userId } = await auth();
  if (!userId) return false;

  const email = await getClerkUserPrimaryEmail(userId);
  return isAtlasOwnerEmail(email);
}
