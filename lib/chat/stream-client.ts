import type { StreamEvent } from "./types";

type StreamErrorBody = {
  error?: string;
  code?: string;
};

type ErrorStreamEvent = StreamEvent & {
  type: "error";
  error: string;
  code?: string;
};

function isErrorStreamEvent(event: StreamEvent): event is ErrorStreamEvent {
  const candidate = event as ErrorStreamEvent;
  return candidate.type === "error" && typeof candidate.error === "string";
}

async function* parseSseStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<StreamEvent> {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;

      const data = line.slice(6).trim();
      if (data === "[DONE]") return;

      try {
        yield JSON.parse(data) as StreamEvent;
      } catch {
        // Skip malformed SSE chunks
      }
    }
  }
}

export type StreamChatOptions = {
  input: string;
  onDelta: (delta: string) => void;
  signal?: AbortSignal;
};

/**
 * Streams a chat response from /api/responses.
 * Invokes onDelta for each text chunk received.
 */
export async function streamChatResponse({
  input,
  onDelta,
  signal,
}: StreamChatOptions): Promise<void> {
  const response = await fetch("/api/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input, stream: true }),
    signal,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | StreamErrorBody
      | null;
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }

  if (!response.body) {
    throw new Error("No response stream received");
  }

  const reader = response.body.getReader();

  try {
    for await (const event of parseSseStream(reader)) {
      if (isErrorStreamEvent(event)) {
        throw new Error(event.error);
      }

      if (event.type === "response.output_text.delta" && event.delta) {
        onDelta(event.delta);
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error("The AI response stream was interrupted");
  } finally {
    reader.releaseLock();
  }
}
