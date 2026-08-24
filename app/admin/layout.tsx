import { requireAtlasOwnerOrNotFound } from "@/lib/auth/require-atlas-owner";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAtlasOwnerOrNotFound();
  return children;
}
