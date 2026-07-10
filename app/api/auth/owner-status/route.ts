import { checkAtlasOwner } from "@/lib/auth/require-atlas-owner";

export async function GET(): Promise<Response> {
  const isOwner = await checkAtlasOwner();
  return Response.json({ isOwner });
}
