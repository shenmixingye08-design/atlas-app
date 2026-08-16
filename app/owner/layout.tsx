import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export const dynamic = "force-dynamic";

export default async function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAtlasOwner();
  return children;
}
