import { redirect } from "next/navigation";

/** Teach-work builder removed from first-time path. */
export default function TeachWorkPage() {
  redirect("/workspace");
}
