"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { Tabs } from "@/components/ui/tabs";
import { connectExternalService } from "@/lib/integrations/external-services";
import {
  fetchGoogleCalendarEventsClient,
  formatCalendarEventWhen,
} from "@/lib/integrations/google/calendar/client";
import type {
  CalendarAutomationTrigger,
  CalendarEvent,
  CalendarEventsResult,
  CalendarRangeId,
} from "@/lib/integrations/google/calendar/types";
import { ui } from "@/lib/i18n";

const RANGE_TABS: { id: CalendarRangeId; label: string }[] = [
  { id: "today", label: ui.calendar.ranges.today },
  { id: "this_week", label: ui.calendar.ranges.thisWeek },
  { id: "next_week", label: ui.calendar.ranges.nextWeek },
];

function CalendarEventCard({ event }: { event: CalendarEvent }) {
  return (
    <li className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-white p-5 shadow-[var(--shadow-sm)]">
      <div className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-foreground">{event.title}</h3>
          {event.isAllDay && (
            <span className="rounded-full bg-[var(--background-subtle)] px-2.5 py-0.5 text-xs font-medium text-[var(--foreground-muted)] ring-1 ring-[var(--border)]">
              {ui.calendar.allDay}
            </span>
          )}
        </div>
        <p className="text-sm text-[var(--foreground-muted)]">
          {formatCalendarEventWhen(event)}
        </p>
        {event.location && (
          <p className="text-sm text-foreground">
            <span className="font-medium">{ui.calendar.locationLabel}:</span>{" "}
            {event.location}
          </p>
        )}
        {event.description && (
          <p className="whitespace-pre-wrap text-sm text-[var(--foreground-muted)]">
            {event.description}
          </p>
        )}
      </div>
    </li>
  );
}

function AutomationTriggersPanel({
  triggers,
}: {
  triggers: readonly CalendarAutomationTrigger[];
}) {
  if (triggers.length === 0) return null;

  return (
    <Card padding="sm" className="border border-[var(--border-subtle)]">
      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            {ui.calendar.automationTitle}
          </h2>
          <p className="mt-1 text-sm text-[var(--foreground-muted)]">
            {ui.calendar.automationHint}
          </p>
        </div>
        <ul className="space-y-2">
          {triggers.map((trigger) => (
            <li
              key={`${trigger.eventId}-${trigger.kind}-${trigger.scheduledAt}`}
              className="rounded-[var(--radius-lg)] bg-[var(--background-subtle)] px-3 py-2 text-sm"
            >
              <span className="font-medium text-foreground">{trigger.title}</span>
              <span className="text-[var(--foreground-muted)]">
                {" · "}
                {trigger.kind === "pre_event_notify"
                  ? ui.calendar.automationPreNotify
                  : ui.calendar.automationPostWork}
                {" · "}
                {formatCalendarEventWhen({
                  startAt: trigger.scheduledAt,
                  endAt: trigger.scheduledAt,
                  isAllDay: false,
                })}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

export function GoogleCalendarPanel() {
  const [range, setRange] = useState<CalendarRangeId>("today");
  const [result, setResult] = useState<CalendarEventsResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const load = useCallback(async (nextRange: CalendarRangeId) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchGoogleCalendarEventsClient(nextRange);
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : ui.error.loadFailed);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(range);
  }, [load, range]);

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);
    try {
      await connectExternalService("google");
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.externalServices.googleConnectError);
      setIsConnecting(false);
    }
  };

  const handleRangeChange = (id: string) => {
    if (id === "today" || id === "this_week" || id === "next_week") {
      setRange(id);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="space-y-3">
        <h1 className="text-display text-foreground">{ui.calendar.title}</h1>
        <p className="max-w-2xl text-body text-[var(--foreground-muted)]">
          {ui.calendar.subtitle}
        </p>
      </header>

      <Tabs tabs={RANGE_TABS} activeId={range} onChange={handleRangeChange} />

      {error && <ErrorState message={error} />}

      {isLoading ? (
        <LoadingState message={ui.calendar.loading} />
      ) : result?.status === "feature_disabled" ? (
        <Card padding="sm">
          <p className="text-sm text-[var(--foreground-muted)]">{result.message}</p>
        </Card>
      ) : result?.status === "google_not_connected" ? (
        <Card padding="md" className="text-center">
          <div className="mx-auto max-w-md space-y-4">
            <p className="text-body text-foreground">{result.message}</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button onClick={() => void handleConnect()} disabled={isConnecting}>
                {isConnecting ? ui.calendar.connecting : ui.actions.connect}
              </Button>
              <Link
                href="/settings"
                className="text-sm text-accent hover:underline"
              >
                {ui.calendar.openSettings}
              </Link>
            </div>
          </div>
        </Card>
      ) : result?.status === "ready" ? (
        <div className="space-y-6">
          <p className="text-caption text-[var(--foreground-muted)]">
            {ui.calendar.rangeLabel(result.snapshot.rangeLabel)} ·{" "}
            {ui.calendar.eventCount(result.snapshot.events.length)}
          </p>

          {range === "today" && (
            <AutomationTriggersPanel triggers={result.automationTriggers} />
          )}

          {result.snapshot.events.length === 0 ? (
            <Card padding="sm">
              <p className="text-sm text-[var(--foreground-muted)]">
                {ui.calendar.empty}
              </p>
            </Card>
          ) : (
            <ul className="space-y-4">
              {result.snapshot.events.map((event) => (
                <CalendarEventCard key={event.id} event={event} />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
