import { auth } from "@clerk/nextjs/server";

import {
  getPersonalMemorySettings,
  updatePersonalMemorySettings,
} from "@/lib/personal-memory/service";
import type { PersonalMemorySettings } from "@/lib/personal-memory/types";

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const settings = await getPersonalMemorySettings(userId);
  return Response.json({ settings });
}

export async function PUT(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as Partial<PersonalMemorySettings> & {
      onDisable?: "keep" | "wipe";
    };
    const settings = await updatePersonalMemorySettings(userId, body);
    return Response.json({ settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "settings_failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
