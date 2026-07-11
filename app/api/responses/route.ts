import OpenAI from "openai";
import type { ResponseStreamEvent } from "openai/resources/responses/responses";
import { auth } from "@clerk/nextjs/server";
import {
  createAtlasResponse,
  createAtlasResponseStream,
  type AtlasResponseRequest,
} from "@/lib/openai";
import { recordOpenAiFailureIfApplicable } from "@/lib/owner/error-monitoring/telemetry";
import { enforceAiRateLimit } from "@/lib/http/enforce-ai-rate-limit";

type RequestBody = {
  input?: unknown;
  instructions?: unknown;
  previous_response_id?: unknown;
  stream?: unknown;
};

function parseRequestBody(body: RequestBody): {
  params: AtlasResponseRequest;
  stream: boolean;
} | { error: string } {
  if (typeof body.input !== "string" || !body.input.trim()) {
    return { error: "input is required and must be a non-empty string" };
  }

  if (
    body.instructions !== undefined &&
    typeof body.instructions !== "string"
  ) {
    return { error: "instructions must be a string" };
  }

  if (
    body.previous_response_id !== undefined &&
    typeof body.previous_response_id !== "string"
  ) {
    return { error: "previous_response_id must be a string" };
  }

  if (body.stream !== undefined && typeof body.stream !== "boolean") {
    return { error: "stream must be a boolean" };
  }

  return {
    params: {
      input: body.input.trim(),
      ...(typeof body.instructions === "string" && {
        instructions: body.instructions,
      }),
      ...(typeof body.previous_response_id === "string" && {
        previousResponseId: body.previous_response_id,
      }),
    },
    stream: body.stream === true,
  };
}

function sanitizeErrorMessage(message: string): string {
  return message.replace(/sk-[a-zA-Z0-9_-]+/g, "[REDACTED]");
}

function toStreamErrorPayload(error: unknown): {
  type: "error";
  error: string;
  code?: string;
} {
  if (error instanceof Error && error.message === "OPENAI_API_KEY is not configured") {
    return {
      type: "error",
      error: "AI service is not configured",
      code: "configuration_error",
    };
  }

  if (error instanceof OpenAI.APIError) {
    return {
      type: "error",
      error: sanitizeErrorMessage(error.message),
      code: error.code ?? error.type ?? undefined,
    };
  }

  console.error("[Atlas /api/responses]", error);

  return {
    type: "error",
    error: "An unexpected error occurred",
    code: "internal_error",
  };
}

function handleError(error: unknown): Response {
  if (error instanceof Error && error.message === "OPENAI_API_KEY is not configured") {
    return Response.json(
      { error: "AI service is not configured" },
      { status: 503 },
    );
  }

  if (error instanceof OpenAI.APIError) {
    recordOpenAiFailureIfApplicable(error, "responses");
    return Response.json(
      {
        error: sanitizeErrorMessage(error.message),
        code: error.code ?? error.type ?? undefined,
      },
      { status: error.status ?? 500 },
    );
  }

  console.error("[Atlas /api/responses]", error);

  recordOpenAiFailureIfApplicable(error, "responses");
  return Response.json(
    { error: "An unexpected error occurred" },
    { status: 500 },
  );
}

function createSseStream(
  stream: AsyncIterable<ResponseStreamEvent>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        const payload = toStreamErrorPayload(error);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
        );
        controller.close();
      }
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = enforceAiRateLimit(userId);
  if (limited) return limited;

  let body: RequestBody;

  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseRequestBody(body);

  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const { params, stream } = parsed;

  try {
    if (stream) {
      const responseStream = await createAtlasResponseStream(params);

      return new Response(createSseStream(responseStream), {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    const response = await createAtlasResponse(params);

    return Response.json({
      id: response.id,
      model: response.model,
      output_text: response.output_text,
      status: response.status,
    });
  } catch (error) {
    return handleError(error);
  }
}
