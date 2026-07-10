"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { detectRecurringIntent } from "@/lib/automations/detect-recurring";
import { streamChatResponse } from "@/lib/chat/stream-client";
import type { ChatMessage } from "@/lib/chat/types";
import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { AutomationSuggestionCard } from "@/components/automations/automation-suggestion-card";

function createId(): string {
  return crypto.randomUUID();
}

function LoadingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-label={ui.loading}>
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent/60 [animation-delay:0ms]" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent/60 [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent/60 [animation-delay:300ms]" />
    </span>
  );
}

export function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recurringSuggestion, setRecurringSuggestion] = useState<
    ReturnType<typeof detectRecurringIntent> | null
  >(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    const prefill = searchParams.get("message");
    if (prefill?.trim()) {
      setInput(prefill);
    }
  }, [searchParams]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    setError(null);
    setInput("");

    const recurring = detectRecurringIntent(trimmed);
    setRecurringSuggestion(recurring.detected ? recurring : null);

    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      content: trimmed,
    };

    const assistantId = createId();

    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: assistantId, role: "assistant", content: "" },
    ]);
    setIsLoading(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamChatResponse({
        input: trimmed,
        signal: controller.signal,
        onDelta: (delta) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId
                ? { ...msg, content: msg.content + delta }
                : msg,
            ),
          );
        },
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;

      const message =
        err instanceof Error ? err.message : ui.error.generic;

      setError(message);
      setMessages((prev) => prev.filter((msg) => msg.id !== assistantId));
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="flex min-h-[calc(100dvh-var(--bottom-nav-height)-6rem)] flex-col animate-fade-up md:min-h-[calc(100vh-8rem)]">
      <div className="flex-1 overflow-y-auto py-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Card padding="lg" className="max-w-md">
              <p className="text-sm font-medium text-foreground">
                {ui.chat.emptyTitle}
              </p>
              <p className="mt-2 text-caption">{ui.chat.emptyHint}</p>
              <p className="mt-4 text-caption text-[var(--foreground-muted)]">
                {ui.chat.automationHint}
              </p>
            </Card>
          </div>
        )}

        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex animate-status-in ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-[var(--radius-xl)] px-4 py-3 text-sm leading-relaxed sm:max-w-[75%] ${
                  message.role === "user"
                    ? "bg-accent text-white"
                    : "bg-[var(--background-subtle)] text-foreground"
                }`}
              >
                {message.role === "assistant" && (
                  <p className="mb-1.5 text-xs font-medium text-accent">
                    {ui.brand}
                  </p>
                )}
                {message.content ? (
                  <p className="whitespace-pre-wrap">{message.content}</p>
                ) : (
                  isLoading && <LoadingDots />
                )}
              </div>
            </div>
          ))}
        </div>

        {recurringSuggestion?.detected && (
          <div className="mt-4 animate-fade-in">
            <AutomationSuggestionCard
              message={recurringSuggestion.suggestionMessage}
              formDefaults={recurringSuggestion.formDefaults}
              onDismiss={() => setRecurringSuggestion(null)}
            />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {error && <ErrorState message={error} className="mb-3" />}

      <Card padding="sm" className="mb-2 shrink-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={ui.chat.placeholder}
            rows={2}
            disabled={isLoading}
            className="max-h-32 min-h-[44px] w-full flex-1 resize-none rounded-[var(--radius-lg)] bg-[var(--background-subtle)] px-4 py-3 text-base text-foreground placeholder:text-[var(--foreground-subtle)] focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-50 sm:text-sm"
            aria-label={ui.chat.placeholder}
          />
          <Button
            variant="primary"
            size="md"
            className="w-full shrink-0 sm:w-auto"
            onClick={() => void handleSend()}
            disabled={isLoading || !input.trim()}
            isLoading={isLoading}
          >
            {ui.chat.send}
          </Button>
        </div>
        <p className="mt-2 px-1 text-caption">{ui.chat.inputHint}</p>
      </Card>
    </div>
  );
}
