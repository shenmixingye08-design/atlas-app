import { redirect } from "next/navigation";

/** Orchestrator console removed from user navigation — use /workspace. */
export default function CommanderPage() {
  redirect("/workspace");
}
