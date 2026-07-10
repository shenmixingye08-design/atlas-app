import type { Metadata } from "next";

import { NotFoundPageContent } from "@/components/system-pages/not-found-page";
import { ui } from "@/lib/i18n";

export const metadata: Metadata = {
  title: ui.systemPages.notFoundMetaTitle,
};

export default function NotFoundRoutePage() {
  return <NotFoundPageContent />;
}
