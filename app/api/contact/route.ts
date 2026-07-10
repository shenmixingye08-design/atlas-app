import {
  resolveClientIp,
  submitContactInquiry,
  type ContactSubmissionInput,
} from "@/lib/contact";

export async function POST(request: Request): Promise<Response> {
  let body: Partial<ContactSubmissionInput>;

  try {
    body = (await request.json()) as Partial<ContactSubmissionInput>;
  } catch {
    return Response.json(
      { ok: false, error: "リクエスト形式が正しくありません。" },
      { status: 400 },
    );
  }

  const result = await submitContactInquiry(body, {
    clientIp: resolveClientIp(request),
    userAgent: request.headers.get("user-agent"),
  });

  if (!result.ok) {
    return Response.json(result, {
      status: result.fieldErrors ? 422 : 429,
    });
  }

  return Response.json(result);
}
