import { auth } from "@clerk/nextjs/server";

import {
  ACCOUNT_DELETION_CONFIRMATION,
  cancelAccountDeletion,
  getAccountDeletionStatus,
  purgeAccount,
  requestAccountWithdrawal,
} from "@/lib/account-deletion";

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const record = await getAccountDeletionStatus(userId);
  return Response.json({ record });
}

type Body = {
  action?: unknown;
  confirmation?: unknown;
};

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body.action;
  try {
    if (action === "withdraw") {
      const record = await requestAccountWithdrawal(userId);
      return Response.json({ record });
    }

    if (action === "cancel") {
      const record = await cancelAccountDeletion(userId);
      return Response.json({ record });
    }

    if (action === "purge") {
      const confirmation =
        typeof body.confirmation === "string" ? body.confirmation : "";
      if (confirmation !== ACCOUNT_DELETION_CONFIRMATION) {
        return Response.json(
          { error: '確認のため "DELETE" と入力してください' },
          { status: 400 },
        );
      }
      const record = await purgeAccount(userId, confirmation);
      return Response.json({ record });
    }

    return Response.json(
      { error: "action must be withdraw, cancel, or purge" },
      { status: 400 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Account deletion failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
