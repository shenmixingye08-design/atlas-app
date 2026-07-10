import type { Metadata } from "next";

import { InternalErrorPageContent } from "@/components/system-pages/internal-error-page";
import { ui } from "@/lib/i18n";

export const metadata: Metadata = {
  title: ui.systemPages.internalErrorMetaTitle,
};

type ServerErrorPageProps = {
  searchParams: Promise<{ id?: string }>;
};

export default async function ServerErrorPage({
  searchParams,
}: ServerErrorPageProps) {
  const params = await searchParams;
  return <InternalErrorPageContent errorId={params.id ?? null} />;
}
