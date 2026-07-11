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
  createGoogleCalendarEventClient,
  deleteGoogleCalendarEventClient,
  fetchCalendarFreeSlotsClient,
  fetchGoogleCalendarEventsClient,
  formatCalendarEventWhen,
  organizeCalendarClient,
  proposeMeetingsClient,
  updateGoogleCalendarEventClient,
} from "@/lib/integrations/google/calendar/client";
import type {
  CalendarAutomationTrigger,
  CalendarEvent,
  CalendarEventInput,
  CalendarEventsResult,
  CalendarFreeSlot,
  CalendarMeetingCandidate,
  CalendarOrganizeInsight,
  CalendarRangeId,
} from "@/lib/integrations/google/calendar/types";
import { ui } from "@/lib/i18n";

const RANGE_TABS: { id: CalendarRangeId; label: string }[] = [
  { id: "today", label: ui.calendar.ranges.today },
  { id: "this_week", label: ui.calendar.ranges.thisWeek },
  { id: "next_week", label: ui.calendar.ranges.nextWeek },
];

function emptyForm(): CalendarEventInput & { eventId?: string } {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    title: "",
    startAt: start.toISOString().slice(0, 16),
    endAt: end.toISOString().slice(0, 16),
    description: "",
    location: "",
    isAllDay: false,
    createMeet: false,
    remindMinutesBefore: 15,
  };
}

function toIsoLocalInput(value: string, isAllDay: boolean): string {
  if (isAllDay) {
    return `${value.slice(0, 10)}T00:00:00.000Z`;
  }
  return new Date(value).toISOString();
}

function CalendarEventCard({
  event,
  busy,
  onEdit,
  onDelete,
}: {
  event: CalendarEvent;
  busy: boolean;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (eventId: string) => void;
}) {
  return (
    <li className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--card)] p-5 shadow-[var(--shadow-sm)]">
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
        {event.meetLink && (
          <p className="text-sm">
            <a
              href={event.meetLink}
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              {ui.calendar.openMeet}
            </a>
          </p>
        )}
        {event.description && (
          <p className="whitespace-pre-wrap text-sm text-[var(--foreground-muted)]">
            {event.description}
          </p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => onEdit(event)}
          >
            {ui.calendar.edit}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => onDelete(event.id)}
          >
            {ui.calendar.delete}
          </Button>
        </div>
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
  const [notice, setNotice] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [insight, setInsight] = useState<CalendarOrganizeInsight | null>(null);
  const [freeSlots, setFreeSlots] = useState<CalendarFreeSlot[]>([]);
  const [candidates, setCandidates] = useState<CalendarMeetingCandidate[]>([]);
  const [meetingPurpose, setMeetingPurpose] = useState("");

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
      setError(
        err instanceof Error ? err.message : ui.externalServices.googleConnectError,
      );
      setIsConnecting(false);
    }
  };

  const handleRangeChange = (id: string) => {
    if (id === "today" || id === "this_week" || id === "next_week") {
      setRange(id);
      setInsight(null);
      setFreeSlots([]);
      setCandidates([]);
    }
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      setError(ui.calendar.titleRequired);
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const payload: CalendarEventInput = {
        title: form.title.trim(),
        startAt: toIsoLocalInput(form.startAt, Boolean(form.isAllDay)),
        endAt: toIsoLocalInput(form.endAt, Boolean(form.isAllDay)),
        description: form.description || null,
        location: form.location || null,
        isAllDay: Boolean(form.isAllDay),
        createMeet: Boolean(form.createMeet),
        remindMinutesBefore:
          typeof form.remindMinutesBefore === "number"
            ? form.remindMinutesBefore
            : 15,
      };

      if (editingId) {
        await updateGoogleCalendarEventClient(editingId, payload);
        setNotice(ui.calendar.updatedNotice);
      } else {
        await createGoogleCalendarEventClient(payload);
        setNotice(ui.calendar.createdNotice);
      }
      setForm(emptyForm());
      setEditingId(null);
      await load(range);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.calendar.saveFailed);
    } finally {
      setBusy(false);
    }
  };

  const handleEdit = (event: CalendarEvent) => {
    const exclusiveEndDate = event.endAt.slice(0, 10);
    let displayEndDate = exclusiveEndDate;
    if (event.isAllDay) {
      const end = new Date(`${exclusiveEndDate}T00:00:00.000Z`);
      end.setUTCDate(end.getUTCDate() - 1);
      const adjusted = end.toISOString().slice(0, 10);
      displayEndDate =
        adjusted >= event.startAt.slice(0, 10)
          ? adjusted
          : event.startAt.slice(0, 10);
    }

    setEditingId(event.id);
    setForm({
      title: event.title,
      startAt: event.isAllDay
        ? event.startAt.slice(0, 10)
        : new Date(event.startAt).toISOString().slice(0, 16),
      endAt: event.isAllDay
        ? displayEndDate
        : new Date(event.endAt).toISOString().slice(0, 16),
      description: event.description ?? "",
      location: event.location ?? "",
      isAllDay: event.isAllDay,
      createMeet: Boolean(event.meetLink),
      remindMinutesBefore: 15,
    });
  };

  const handleDelete = async (eventId: string) => {
    if (!window.confirm(ui.calendar.deleteConfirm)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await deleteGoogleCalendarEventClient(eventId);
      setNotice(ui.calendar.deletedNotice);
      if (editingId === eventId) {
        setEditingId(null);
        setForm(emptyForm());
      }
      await load(range);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.calendar.deleteFailed);
    } finally {
      setBusy(false);
    }
  };

  const handleOrganize = async () => {
    setBusy(true);
    setError(null);
    try {
      setInsight(await organizeCalendarClient(range));
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.calendar.organizeFailed);
    } finally {
      setBusy(false);
    }
  };

  const handleFreeSlots = async () => {
    setBusy(true);
    setError(null);
    try {
      setFreeSlots(await fetchCalendarFreeSlotsClient(range, 30));
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.calendar.freebusyFailed);
    } finally {
      setBusy(false);
    }
  };

  const handlePropose = async () => {
    setBusy(true);
    setError(null);
    try {
      setCandidates(
        await proposeMeetingsClient({
          range,
          durationMinutes: 30,
          purpose: meetingPurpose || undefined,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.calendar.proposeFailed);
    } finally {
      setBusy(false);
    }
  };

  const applyCandidate = (candidate: CalendarMeetingCandidate) => {
    setEditingId(null);
    setForm({
      ...emptyForm(),
      title: meetingPurpose.trim() || ui.calendar.defaultMeetingTitle,
      startAt: new Date(candidate.startAt).toISOString().slice(0, 16),
      endAt: new Date(candidate.endAt).toISOString().slice(0, 16),
      createMeet: true,
      remindMinutesBefore: 15,
    });
    setNotice(ui.calendar.candidateApplied);
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
      {notice && (
        <p className="text-sm text-[var(--status-success)]">{notice}</p>
      )}

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
          <Card padding="sm" className="border border-[var(--border-subtle)]">
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">
                {editingId ? ui.calendar.editTitle : ui.calendar.createTitle}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm sm:col-span-2">
                  <span className="text-[var(--foreground-muted)]">
                    {ui.calendar.fieldTitle}
                  </span>
                  <input
                    value={form.title}
                    onChange={(e) =>
                      setForm((current) => ({ ...current, title: e.target.value }))
                    }
                    className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-[var(--foreground-muted)]">
                    {ui.calendar.fieldStart}
                  </span>
                  <input
                    type={form.isAllDay ? "date" : "datetime-local"}
                    value={form.startAt}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        startAt: e.target.value,
                      }))
                    }
                    className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-[var(--foreground-muted)]">
                    {ui.calendar.fieldEnd}
                  </span>
                  <input
                    type={form.isAllDay ? "date" : "datetime-local"}
                    value={form.endAt}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        endAt: e.target.value,
                      }))
                    }
                    className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2"
                  />
                </label>
                <label className="space-y-1 text-sm sm:col-span-2">
                  <span className="text-[var(--foreground-muted)]">
                    {ui.calendar.locationLabel}
                  </span>
                  <input
                    value={form.location ?? ""}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        location: e.target.value,
                      }))
                    }
                    className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2"
                  />
                </label>
                <label className="space-y-1 text-sm sm:col-span-2">
                  <span className="text-[var(--foreground-muted)]">
                    {ui.calendar.fieldDescription}
                  </span>
                  <textarea
                    value={form.description ?? ""}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        description: e.target.value,
                      }))
                    }
                    rows={3}
                    className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2"
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(form.isAllDay)}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        isAllDay: e.target.checked,
                      }))
                    }
                  />
                  {ui.calendar.allDay}
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(form.createMeet)}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        createMeet: e.target.checked,
                      }))
                    }
                  />
                  {ui.calendar.createMeet}
                </label>
                <label className="inline-flex items-center gap-2">
                  {ui.calendar.remindBefore}
                  <input
                    type="number"
                    min={0}
                    value={form.remindMinutesBefore ?? 15}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        remindMinutesBefore: Number(e.target.value) || 0,
                      }))
                    }
                    className="w-20 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 py-1"
                  />
                  {ui.calendar.minutes}
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy} onClick={() => void handleSubmit()}>
                  {editingId ? ui.calendar.saveChanges : ui.calendar.create}
                </Button>
                {editingId && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      setEditingId(null);
                      setForm(emptyForm());
                    }}
                  >
                    {ui.calendar.cancelEdit}
                  </Button>
                )}
              </div>
            </div>
          </Card>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => void handleOrganize()}
            >
              {ui.calendar.organize}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => void handleFreeSlots()}
            >
              {ui.calendar.findFree}
            </Button>
            <input
              value={meetingPurpose}
              onChange={(e) => setMeetingPurpose(e.target.value)}
              placeholder={ui.calendar.meetingPurposePlaceholder}
              className="min-w-[180px] flex-1 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => void handlePropose()}
            >
              {ui.calendar.proposeMeetings}
            </Button>
          </div>

          {insight && (
            <Card padding="sm" className="border border-[var(--border-subtle)]">
              <h2 className="text-sm font-semibold text-foreground">
                {ui.calendar.organizeTitle}
              </h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--foreground-muted)]">
                {insight.summaryLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {insight.conflicts.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-medium text-foreground">
                    {ui.calendar.conflictsTitle}
                  </p>
                  <ul className="mt-1 list-disc pl-5 text-sm text-[var(--status-error)]">
                    {insight.conflicts.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}
              {insight.suggestions.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-medium text-foreground">
                    {ui.calendar.suggestionsTitle}
                  </p>
                  <ul className="mt-1 list-disc pl-5 text-sm text-[var(--foreground-muted)]">
                    {insight.suggestions.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}

          {freeSlots.length > 0 && (
            <Card padding="sm" className="border border-[var(--border-subtle)]">
              <h2 className="text-sm font-semibold text-foreground">
                {ui.calendar.freeSlotsTitle}
              </h2>
              <ul className="mt-2 space-y-2 text-sm text-[var(--foreground-muted)]">
                {freeSlots.slice(0, 8).map((slot) => (
                  <li key={`${slot.startAt}-${slot.endAt}`}>
                    {formatCalendarEventWhen({
                      startAt: slot.startAt,
                      endAt: slot.endAt,
                      isAllDay: false,
                    })}{" "}
                    · {slot.durationMinutes}
                    {ui.calendar.minutes}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {candidates.length > 0 && (
            <Card padding="sm" className="border border-[var(--border-subtle)]">
              <h2 className="text-sm font-semibold text-foreground">
                {ui.calendar.candidatesTitle}
              </h2>
              <ul className="mt-3 space-y-3">
                {candidates.map((candidate) => (
                  <li
                    key={`${candidate.startAt}-${candidate.endAt}`}
                    className="rounded-[var(--radius-lg)] bg-[var(--background-subtle)] p-3 text-sm"
                  >
                    <p className="font-medium text-foreground">
                      {formatCalendarEventWhen({
                        startAt: candidate.startAt,
                        endAt: candidate.endAt,
                        isAllDay: false,
                      })}
                    </p>
                    <p className="mt-1 text-[var(--foreground-muted)]">
                      {candidate.reason}
                    </p>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-2"
                      onClick={() => applyCandidate(candidate)}
                    >
                      {ui.calendar.useCandidate}
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

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
                <CalendarEventCard
                  key={event.id}
                  event={event}
                  busy={busy}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
