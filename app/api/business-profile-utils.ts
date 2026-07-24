import { auth } from "@clerk/nextjs/server";

import { BusinessProfileError } from "@/lib/business-profile";

export type RouteContext<T extends Record<string, string>> = {
  params: Promise<T>;
};

export async function requireUserId(): Promise<
  | { ok: true; userId: string }
  | { ok: false; response: Response }
> {
  const { userId } = await auth();
  if (!userId) {
    return {
      ok: false,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true, userId };
}

export async function readJsonBody(request: Request): Promise<
  | { ok: true; body: unknown }
  | { ok: false; response: Response }
> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return {
      ok: false,
      response: Response.json({ error: "Invalid JSON" }, { status: 400 }),
    };
  }
}

export function validationErrorResponse(result: {
  error: string;
  fieldErrors?: Array<{ field: string; message: string }>;
}): Response {
  return Response.json(
    {
      error: result.error,
      fieldErrors: result.fieldErrors ?? [],
    },
    { status: 400 },
  );
}

export function businessProfileErrorResponse(error: BusinessProfileError): Response {
  const status =
    error.code === "switch_required" || error.code === "invalid_switch" ? 409 : 400;
  return Response.json(
    { error: error.message, code: error.code },
    { status },
  );
}

export function unknownErrorResponse(error: unknown, scope: string): Response {
  if (error instanceof BusinessProfileError) {
    return businessProfileErrorResponse(error);
  }
  console.error(`[Atlas ${scope}]`, error);
  return Response.json({ error: "Internal server error" }, { status: 500 });
}

export function parseNullableProfileFilter(request: Request): {
  profileId?: string | null;
} {
  const url = new URL(request.url);
  if (!url.searchParams.has("profileId")) return {};
  const value = url.searchParams.get("profileId");
  if (!value || value === "null" || value === "none") return { profileId: null };
  return { profileId: value };
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export function asOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function asStringRecord(value: unknown): Record<string, string | null> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const result: Record<string, string | null> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === null || item === undefined) {
      result[key] = null;
    } else if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      result[key] = String(item);
    }
  }
  return result;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
