import { redirect } from "next/navigation";

/** Chat UI removed from first-time path — secretary home is the only ask surface. */
export default function ChatPage() {
  redirect("/projects");
}
