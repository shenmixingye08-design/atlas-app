"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  fetchGoogleCalendarEventsClient,
  formatCalendarEventWhen,
} from "@/lib/integrations/google/calendar/client";
import type { CalendarEvent } from "@/lib/integrations/google/calendar/types";
import { ui } from "@/lib/i18n";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; events: CalendarEvent[] }
  | { status: "unavailable"; message: string };

/** Home section: today's real Google Calendar events (no dummy data). */
export function TodaysCalendarSection() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const result = await fetchGoogleCalendarEventsClient("today");
        if (cancelled) return;

        if (result.status === "ready") {
          setState({
            status: "ready",
            events: [...result.snapshot.events].slice(0, 5),
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
            message: ui.calendar.todaysUnavailable,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section aria-labelledby="todays-calendar-heading" className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <h2
          id="todays-calendar-heading"
          className="text-lg font-semibold tracking-tight text-foreground sm:text-xl"
        >
          {ui.calendar.todaysTitle}
        </h2>
        <Link
          href="/workspace/calendar"
          className="text-sm text-accent transition-opacity hover:opacity-80"
        >
          {ui.morningBrief.viewCalendar}
        </Link>
      </div>

      {state.status === "loading" ? (
        <p className="text-sm text-[var(--foreground-muted)]">{ui.calendar.loading}</p>
      ) : state.status === "unavailable" ? (
        <div className="rounded-[24px] border border-dashed border-[var(--border-subtle)] bg-[var(--background-subtle)]/40 px-6 py-6">
          <p className="text-sm text-[var(--foreground-muted)]">{state.message}</p>
          <Link
            href="/settings/google/calendar"
            className="mt-3 inline-flex text-sm text-accent hover:underline"
          >
            {ui.morningBrief.calendarConnect}
          </Link>
        </div>
      ) : state.events.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-[var(--border-subtle)] bg-[var(--background-subtle)]/40 px-6 py-6 text-center">
          <p className="text-sm text-[var(--foreground-muted)]">
            {ui.calendar.todaysEmpty}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {state.events.map((event) => (
            <li key={event.id}>
              <Link
                href="/workspace/calendar"
                className="flex flex-col gap-1 rounded-[22px] border border-[var(--border-subtle)] bg-[var(--card)] px-5 py-4 shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]"
              >
                <p className="truncate text-sm font-medium text-foreground">
                  {event.title}
                </p>
                <p className="text-xs text-[var(--foreground-muted)]">
                  {formatCalendarEventWhen(event)}
                  {event.meetLink ? ` · ${ui.calendar.meetBadge}` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
