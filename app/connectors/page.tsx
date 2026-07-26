import { redirect } from "next/navigation";

/** Duplicate connectors console → settings 連携. */
export default function ConnectorsPage() {
  redirect("/settings");
}
