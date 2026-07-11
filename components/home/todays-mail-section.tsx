"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  fetchGmailMessagesClient,
  formatGmailReceivedAt,
} from "@/lib/integrations/google/gmail/client";
import type { GmailMessage } from "@/lib/integrations/google/gmail/types";
import { ui } from "@/lib/i18n";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; messages: GmailMessage[] }
  | { status: "unavailable"; message: string };

/**
 * Home section: today's real Gmail inbox messages (no dummy data).
 */
export function TodaysMailSection() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const result = await fetchGmailMessagesClient("today");
        if (cancelled) return;

        if (result.status === "ready") {
          setState({
            status: "ready",
            messages: [...result.snapshot.messages].slice(0, 5),
          });
          return;
        }

        setState({
          status: "unavailable",
          message: result.message,
        });
      } catch {
        if (!cancelled) {
          setState({
            status: "unavailable",
            message: ui.gmail.todaysMailUnavailable,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section aria-labelledby="todays-mail-heading" className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <h2
          id="todays-mail-heading"
          className="text-lg font-semibold tracking-tight text-foreground sm:text-xl"
        >
          {ui.gmail.todaysMailTitle}
        </h2>
        <Link
          href="/workspace/mail"
          className="text-sm text-accent transition-opacity hover:opacity-80"
        >
          {ui.morningBrief.viewMail}
        </Link>
      </div>

      {state.status === "loading" ? (
        <p className="text-sm text-[var(--foreground-muted)]">{ui.gmail.loading}</p>
      ) : state.status === "unavailable" ? (
        <div className="rounded-[24px] border border-dashed border-[var(--border-subtle)] bg-[var(--background-subtle)]/40 px-6 py-6">
          <p className="text-sm text-[var(--foreground-muted)]">{state.message}</p>
          <Link
            href="/settings/google/gmail"
            className="mt-3 inline-flex text-sm text-accent hover:underline"
          >
            {ui.morningBrief.unreadMailConnect}
          </Link>
        </div>
      ) : state.messages.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-[var(--border-subtle)] bg-[var(--background-subtle)]/40 px-6 py-6 text-center">
          <p className="text-sm text-[var(--foreground-muted)]">
            {ui.gmail.todaysMailEmpty}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {state.messages.map((message) => (
            <li key={message.id}>
              <Link
                href="/workspace/mail"
                className="flex flex-col gap-1 rounded-[22px] border border-[var(--border-subtle)] bg-[var(--card)] px-5 py-4 shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="truncate text-sm font-medium text-foreground">
                    {message.subject}
                  </p>
                  {message.isUnread && (
                    <span className="shrink-0 rounded-full bg-[var(--status-warning-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--status-warning)]">
                      {ui.gmail.unreadBadge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--foreground-muted)]">
                  {message.sender} · {formatGmailReceivedAt(message.receivedAt)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
