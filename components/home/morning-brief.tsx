"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { runAutomationNow } from "@/lib/automations/client";
import type { Automation } from "@/lib/automations/types";
import { normalizeAutomations } from "@/lib/compatibility";
import { getEmployeeStatusLabel } from "@/lib/home/daily-brief";
import {
  buildMorningBrief,
  formatCalendarEventTime,
  type MorningBrief,
} from "@/lib/home/morning-brief";
import { getTodaysAutomations } from "@/lib/automations/today";
import {
  automationToDashboardJob,
  sortAutomationJobs,
} from "@/lib/home/today-dashboard";
import {
  getSkippedAutomationIds,
  isAutomationSkippedToday,
} from "@/lib/home/today-skipped-store";
import {
  fetchGoogleCalendarEventsClient,
} from "@/lib/integrations/google/calendar/client";
import type { CalendarEvent } from "@/lib/integrations/google/calendar/types";
import { fetchGmailMessagesClient } from "@/lib/integrations/google/gmail/client";
import type { GmailMessage } from "@/lib/integrations/google/gmail/types";
import { ui } from "@/lib/i18n";
import type { Project } from "@/lib/projects/types";
import { cn } from "@/lib/design-system/cn";
import { Button } from "@/components/ui/button";

type MorningBriefProps = {
  automations: Automation[];
  projects: Project[];
  profileVersion?: number;
  onAutomationRun?: () => void;
};

type GoogleBriefState = {
  calendarEvents: CalendarEvent[] | null;
  calendarStatus: "loading" | "ready" | "unavailable";
  unreadMessages: GmailMessage[] | null;
  unreadCount: number;
  gmailStatus: "loading" | "ready" | "unavailable";
};

function BriefRow({
  icon,
  title,
  count,
  href,
  children,
  className,
}: {
  icon: string;
  title: string;
  count?: number;
  href?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const heading = (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <span aria-hidden>{icon}</span>
        {title}
      </span>
      {count !== undefined && count > 0 && (
        <span className="shrink-0 rounded-full bg-[var(--accent-muted)] px-2 py-0.5 text-[10px] font-medium text-accent">
          {ui.morningBrief.unreadCount(count)}
        </span>
      )}
    </div>
  );

  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border border-white/40 bg-white/50 px-4 py-3.5",
        className,
      )}
    >
      {href ? (
        <Link href={href} className="block space-y-2 transition-opacity hover:opacity-80">
          {heading}
          {children}
        </Link>
      ) : (
        <div className="space-y-2">
          {heading}
          {children}
        </div>
      )}
    </div>
  );
}

function BriefListItem({
  primary,
  secondary,
}: {
  primary: string;
  secondary?: string;
}) {
  return (
    <li className="flex items-baseline justify-between gap-3 text-sm">
      <span className="min-w-0 truncate text-foreground">{primary}</span>
      {secondary && (
        <span className="shrink-0 text-xs text-[var(--text-secondary)]">{secondary}</span>
      )}
    </li>
  );
}

function EmployeeChip({
  icon,
  role,
  status,
  tasks,
}: {
  icon: string;
  role: string;
  status: "active" | "idle" | "reviewing";
  tasks: number;
}) {
  return (
    <li className="flex items-center gap-2 rounded-[var(--radius-md)] bg-white/60 px-2.5 py-2">
      <span aria-hidden>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground">{role}</p>
        <p className="text-[10px] text-[var(--text-muted)]">
          {getEmployeeStatusLabel(status)}
          {tasks > 0 ? ` · ${ui.dailyBrief.employeeTasks(tasks)}` : ""}
        </p>
      </div>
    </li>
  );
}

export function MorningBrief({
  automations,
  projects,
  profileVersion = 0,
  onAutomationRun,
}: MorningBriefProps) {
  const [googleState, setGoogleState] = useState<GoogleBriefState>({
    calendarEvents: null,
    calendarStatus: "loading",
    unreadMessages: null,
    unreadCount: 0,
    gmailStatus: "loading",
  });
  const [starting, setStarting] = useState(false);
  const router = useRouter();

  const brief: MorningBrief = useMemo(() => {
    void profileVersion;
    return buildMorningBrief({ automations, projects });
  }, [automations, projects, profileVersion]);

  const greeting = ui.dailyBrief.greeting[brief.greetingPeriod];

  const firstJob = useMemo(() => {
    try {
      const automationsSafe = normalizeAutomations(automations);
      const skippedAutomationIds = new Set(getSkippedAutomationIds());
      const jobs = getTodaysAutomations(automationsSafe)
        .map(({ automation }) =>
          automationToDashboardJob(
            automation,
            skippedAutomationIds.has(automation.id) ||
              isAutomationSkippedToday(automation.id),
          ),
        )
        .filter((job) => job.status !== "completed" && job.status !== "skipped");

      return sortAutomationJobs(jobs)[0] ?? null;
    } catch {
      return null;
    }
  }, [automations]);

  const loadGoogleData = useCallback(async () => {
    setGoogleState((prev) => ({
      ...prev,
      calendarStatus: "loading",
      gmailStatus: "loading",
    }));

    const [calendarResult, gmailResult] = await Promise.all([
      fetchGoogleCalendarEventsClient("today").catch(() => null),
      fetchGmailMessagesClient("unread").catch(() => null),
    ]);

    setGoogleState({
      calendarEvents:
        calendarResult?.status === "ready"
          ? [...calendarResult.snapshot.events].slice(0, 4)
          : null,
      calendarStatus:
        calendarResult?.status === "ready" ? "ready" : "unavailable",
      unreadMessages:
        gmailResult?.status === "ready"
          ? gmailResult.snapshot.messages.filter((m) => m.isUnread).slice(0, 3)
          : null,
      unreadCount:
        gmailResult?.status === "ready"
          ? gmailResult.snapshot.messages.filter((m) => m.isUnread).length
          : 0,
      gmailStatus: gmailResult?.status === "ready" ? "ready" : "unavailable",
    });
  }, []);

  useEffect(() => {
    void loadGoogleData();
  }, [loadGoogleData]);

  const handleStartToday = async () => {
    if (firstJob?.automationId) {
      setStarting(true);
      try {
        await runAutomationNow(firstJob.automationId);
        onAutomationRun?.();
      } finally {
        setStarting(false);
      }
      return;
    }

    if (brief.atlas.atlasWork[0]?.href) {
      router.push(brief.atlas.atlasWork[0].href);
      return;
    }

    router.push("/workspace");
  };

  const calendarPreview =
    googleState.calendarStatus === "loading" ? (
      <p className="text-xs text-[var(--text-muted)]">{ui.morningBrief.loading}</p>
    ) : googleState.calendarStatus === "unavailable" ? (
      <Link
        href="/settings/google/calendar"
        className="text-xs text-accent hover:underline"
      >
        {ui.morningBrief.calendarConnect}
      </Link>
    ) : googleState.calendarEvents && googleState.calendarEvents.length > 0 ? (
      <ul className="space-y-1.5">
        {googleState.calendarEvents.map((event) => (
          <BriefListItem
            key={event.id}
            primary={event.title}
            secondary={formatCalendarEventTime(event)}
          />
        ))}
      </ul>
    ) : (
      <p className="text-xs text-[var(--text-secondary)]">{ui.morningBrief.calendarEmpty}</p>
    );

  const mailPreview =
    googleState.gmailStatus === "loading" ? (
      <p className="text-xs text-[var(--text-muted)]">{ui.morningBrief.loading}</p>
    ) : googleState.gmailStatus === "unavailable" ? (
      <Link
        href="/settings/google/gmail"
        className="text-xs text-accent hover:underline"
      >
        {ui.morningBrief.unreadMailConnect}
      </Link>
    ) : googleState.unreadMessages && googleState.unreadMessages.length > 0 ? (
      <ul className="space-y-1.5">
        {googleState.unreadMessages.map((message) => (
          <BriefListItem key={message.id} primary={message.subject} secondary={message.sender} />
        ))}
      </ul>
    ) : (
      <p className="text-xs text-[var(--text-secondary)]">{ui.morningBrief.unreadMailEmpty}</p>
    );

  const unreadCount = googleState.unreadCount;

  return (
    <section
      aria-labelledby="morning-brief-heading"
      className="landing-glass animate-fade-up overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] shadow-[var(--shadow-md)]"
    >
      <div className="border-b border-white/30 px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-accent">
              {ui.morningBrief.badge}
            </p>
            <h2 id="morning-brief-heading" className="text-lg font-semibold text-foreground sm:text-xl">
              {ui.morningBrief.title}
            </h2>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-foreground">{brief.dateLabel}</p>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              {ui.morningBrief.weatherLabel} · {ui.morningBrief.weatherPlaceholder}
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-1">
          <p className="text-base font-medium text-foreground">{greeting}</p>
          <p className="text-sm text-[var(--text-secondary)]">{brief.intro}</p>
          <p className="text-sm text-foreground">{brief.headline}</p>
        </div>
      </div>

      <div className="space-y-3 px-5 py-5 sm:px-6 sm:py-6">
        <BriefRow
          icon="📅"
          title={ui.morningBrief.calendar}
          count={
            googleState.calendarEvents && googleState.calendarEvents.length > 0
              ? googleState.calendarEvents.length
              : undefined
          }
          href="/workspace/calendar"
        >
          {calendarPreview}
        </BriefRow>

        <BriefRow
          icon="📋"
          title={ui.morningBrief.atlasWork}
          count={
            brief.atlas.atlasWork.length > 0 ? brief.atlas.atlasWork.length : undefined
          }
          href="/automations"
        >
          {brief.atlas.atlasWork.length > 0 ? (
            <ul className="space-y-1.5">
              {brief.atlas.atlasWork.slice(0, 4).map((item) => (
                <BriefListItem key={item.id} primary={item.label} secondary={item.subtitle} />
              ))}
            </ul>
          ) : (
            <p className="text-xs text-[var(--text-secondary)]">{ui.morningBrief.atlasWorkEmpty}</p>
          )}
        </BriefRow>

        <BriefRow
          icon="📧"
          title={ui.morningBrief.unreadMail}
          count={unreadCount > 0 ? unreadCount : undefined}
          href="/workspace/mail"
        >
          {mailPreview}
        </BriefRow>

        <div className="grid gap-3 sm:grid-cols-2">
          <BriefRow icon="📱" title={ui.morningBrief.snsPosts}>
            {brief.atlas.snsPosts.length > 0 ? (
              <ul className="space-y-1.5">
                {brief.atlas.snsPosts.map((item) => (
                  <BriefListItem key={item.id} primary={item.label} secondary={item.subtitle} />
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[var(--text-secondary)]">{ui.morningBrief.snsPostsEmpty}</p>
            )}
          </BriefRow>

          <BriefRow icon="📄" title={ui.morningBrief.salesMaterials}>
            {brief.atlas.salesMaterials.length > 0 ? (
              <ul className="space-y-1.5">
                {brief.atlas.salesMaterials.map((item) => (
                  <BriefListItem key={item.id} primary={item.label} secondary={item.subtitle} />
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[var(--text-secondary)]">
                {ui.morningBrief.salesMaterialsEmpty}
              </p>
            )}
          </BriefRow>
        </div>

        <BriefRow icon="🤖" title={ui.morningBrief.employees}>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {brief.employees.map((employee) => (
              <EmployeeChip
                key={employee.id}
                icon={employee.icon}
                role={employee.role}
                status={employee.status}
                tasks={employee.todayTasks}
              />
            ))}
          </ul>
        </BriefRow>

        <div className="grid gap-3 sm:grid-cols-2">
          <BriefRow icon="⏱" title={ui.morningBrief.hoursSavedToday}>
            <p className="text-sm font-semibold text-accent">
              {brief.atlas.estimatedHoursSaved > 0
                ? ui.morningBrief.hoursSavedValue(brief.atlas.estimatedHoursSaved)
                : ui.morningBrief.hoursSavedEmpty}
            </p>
          </BriefRow>

          <BriefRow icon="💬" title={ui.morningBrief.dailyTip}>
            <p className="text-sm leading-relaxed text-foreground">{brief.dailyTip}</p>
          </BriefRow>
        </div>
      </div>

      <div className="border-t border-white/30 bg-white/30 px-5 py-5 sm:px-6">
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          isLoading={starting}
          onClick={() => void handleStartToday()}
        >
          {firstJob || brief.atlas.atlasWork.length > 0
            ? ui.morningBrief.startToday
            : ui.morningBrief.startTodayEmpty}
        </Button>
      </div>
    </section>
  );
}
