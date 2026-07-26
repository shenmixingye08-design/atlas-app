import { redirect } from "next/navigation";

/** Duplicate integrations console → settings 連携. */
export default function IntegrationsPage() {
  redirect("/settings");
}
