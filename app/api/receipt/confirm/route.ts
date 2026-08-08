import { auth } from "@clerk/nextjs/server";

import { confirmReceiptSession } from "@/lib/receipt";
import type { MoneyUse, ReceiptCategory } from "@/lib/receipt";
import { clientSafeMessage } from "@/lib/security/client-safe-message";

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    sessionId?: string;
    fieldAnswers?: Record<string, string>;
    category?: ReceiptCategory;
    moneyUse?: MoneyUse;
    registerAsExpense?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.sessionId) {
    return Response.json({ error: "sessionId が必要です" }, { status: 400 });
  }

  try {
    const session = await confirmReceiptSession({
      userId,
      sessionId: body.sessionId,
      fieldAnswers: body.fieldAnswers,
      category: body.category,
      moneyUse: body.moneyUse,
      registerAsExpense: body.registerAsExpense,
    });
    return Response.json({ session });
  } catch (error) {
    return Response.json(
      {
        error:
          clientSafeMessage(error, "確認処理に失敗しました"),
      },
      { status: 400 },
    );
  }
}
