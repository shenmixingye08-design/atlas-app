import { redirect } from "next/navigation";

/** @deprecated Use /mihon */
export default function MarketplacePage() {
  redirect("/mihon");
}
