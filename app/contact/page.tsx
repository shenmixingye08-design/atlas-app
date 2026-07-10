import type { Metadata } from "next";

import { ContactPage } from "@/components/contact/contact-page";
import { ui } from "@/lib/i18n";

export const metadata: Metadata = {
  title: ui.contact.metaTitle,
  description: ui.contact.metaDescription,
};

export default function ContactRoutePage() {
  return <ContactPage />;
}
