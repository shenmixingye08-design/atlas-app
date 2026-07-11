import "server-only";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { getClerkUserPrimaryEmail } from "./get-clerk-user-email";
import {
  assertOwnerEmailsConfiguredForProduction,
  isAtlasOwnerEmail,
} from "./is-atlas-owner";

export async function requireAtlasOwner(): Promise<{ email: string }> {
  assertOwnerEmailsConfiguredForProduction();

  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const email = await getClerkUserPrimaryEmail(userId);

  if (!isAtlasOwnerEmail(email)) {
    redirect("/");
  }

  return { email: email! };
}

export async function checkAtlasOwner(): Promise<boolean> {
  const { userId } = await auth();
  if (!userId) return false;

  const email = await getClerkUserPrimaryEmail(userId);
  return isAtlasOwnerEmail(email);
}
