import { getSystemStatusSnapshot } from "@/lib/owner/system-status/service";

export async function GET(): Promise<Response> {
  return Response.json(getSystemStatusSnapshot(), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
