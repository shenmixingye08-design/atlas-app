import { auth } from "@clerk/nextjs/server";

import type { GmailReplyDraftContent } from "@/lib/integrations/google/gmail/types";
import {
  listGmailReplyDrafts,
  saveGmailReplyDraft,
} from "@/lib/integrations/google/gmail/reply-draft-store";

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  return Response.json({ drafts: listGmailReplyDrafts(userId) });
}

type RequestBody = Partial<GmailReplyDraftContent>;

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return Response.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  if (
    typeof body.messageId !== "string" ||
    !body.messageId.trim() ||
    typeof body.subject !== "string" ||
    typeof body.to !== "string" ||
    typeof body.body !== "string"
  ) {
    return Response.json(
      { message: "messageId, subject, to, and body are required" },
      { status: 400 },
    );
  }

  const draft = saveGmailReplyDraft(userId, {
    messageId: body.messageId.trim(),
    subject: body.subject.trim(),
    to: body.to.trim(),
    body: body.body.trim(),
  });

  return Response.json({ draft });
}
