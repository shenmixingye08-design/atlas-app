import { auth } from "@clerk/nextjs/server";

import {
  createUserMemory,
  listUserMemories,
} from "@/lib/user-memory/service";
import type { CreateMemoryInput } from "@/lib/user-memory/types";

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return Response.json(listUserMemories(userId));
}

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: CreateMemoryInput;
  try {
    body = (await request.json()) as CreateMemoryInput;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.title?.trim() || !body.content?.trim() || !body.category) {
    return Response.json({ error: "title, content, and category are required" }, { status: 400 });
  }

  const memory = createUserMemory(userId, {
    ...body,
    title: body.title.trim(),
    content: body.content.trim(),
  });

  return Response.json({ memory }, { status: 201 });
}
