import { redirect } from "next/navigation";

/** Duplicate connections console → settings 連携. */
export default function ConnectionsPage() {
  redirect("/settings");
}
