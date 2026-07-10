import { auth } from "@clerk/nextjs/server";

import { learnFromProfileSync } from "@/lib/user-memory/service";
import type { JobCategoryId } from "@/lib/user-profile/types";

type SyncBody = {
  profile?: {
    frequentlyUsedJobs: Array<{ jobCategory: string; label: string; count: number }>;
    jobSettings: Record<
      string,
      {
        preferredFormat?: string;
        preferredHour?: number;
        preferredMinute?: number;
        executionLevel?: string;
        usageCount: number;
      }
    >;
    manualOverrides: Array<{
      label: string;
      summary: string;
      jobCategory: string;
    }>;
  };
};

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: SyncBody;
  try {
    body = (await request.json()) as SyncBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.profile) {
    return Response.json({ error: "profile is required" }, { status: 400 });
  }

  learnFromProfileSync(userId, {
    frequentlyUsedJobs: body.profile.frequentlyUsedJobs.map((job) => ({
      ...job,
      jobCategory: job.jobCategory as JobCategoryId,
    })),
    jobSettings: Object.fromEntries(
      Object.entries(body.profile.jobSettings).map(([key, value]) => [
        key as JobCategoryId,
        value,
      ]),
    ),
    manualOverrides: body.profile.manualOverrides.map((item) => ({
      ...item,
      jobCategory: item.jobCategory as JobCategoryId,
    })),
  });

  return Response.json({ ok: true });
}
