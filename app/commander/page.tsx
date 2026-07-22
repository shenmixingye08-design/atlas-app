import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";

import { isAtlasOwnerEmail } from "@/lib/auth/is-atlas-owner";
import { ui } from "@/lib/i18n";

export const metadata: Metadata = {
  title: ui.phase3.executionStatus,
  description: ui.phase3.executionStatus,
};

/**
 * AI Orchestra is internal — normal users land on 仕事 (history).
 * Owners retain access for debugging.
 */
export default async function CommanderPage() {
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress;
  if (!user || !isAtlasOwnerEmail(email)) {
    redirect("/history");
  }

  const { default: CommanderClientPage } = await import(
    "./commander-client"
  );
  return <CommanderClientPage />;
}
