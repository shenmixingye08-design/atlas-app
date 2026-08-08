import { auth } from "@clerk/nextjs/server";

import { exportHouseholdExcel } from "@/lib/receipt";
import { clientSafeMessage } from "@/lib/security/client-safe-message";

export async function GET(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const yearMonth = url.searchParams.get("month") ?? undefined;
  try {
    const { filename, buffer } = await exportHouseholdExcel(userId, yearMonth);
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          clientSafeMessage(error, "Excel出力に失敗しました"),
      },
      { status: 500 },
    );
  }
}
