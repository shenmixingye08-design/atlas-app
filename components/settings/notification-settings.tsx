"use client";

import { useEffect, useState } from "react";

import {
  fetchNotificationPreferences,
  updateNotificationPreferences,
} from "@/lib/notifications/client";
import type {
  LineNotifyEvent,
  NotificationPreferences,
} from "@/lib/notifications/types";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/lib/notifications/types";
import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type ToggleRowProps = {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
};

function ToggleRow({ label, description, checked, disabled, onChange }: ToggleRowProps) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] px-4 py-3">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">{description}</p>
        )}
      </div>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 accent-accent"
      />
    </label>
  );
}

type LineConnectionState = {
  configured: boolean;
  linked: boolean;
  displayName: string | null;
  lineEnabled: boolean;
  botBasicId: string | null;
  linkCode?: { code: string; expiresAt: string };
};

const LINE_EVENT_ROWS: { id: LineNotifyEvent; label: string }[] = [
  { id: "work_completed", label: ui.notifications.lineEventWorkCompleted },
  { id: "mail_received", label: ui.notifications.lineEventMailReceived },
  { id: "document_ready", label: ui.notifications.lineEventDocumentReady },
  { id: "automation_completed", label: ui.notifications.lineEventAutomationCompleted },
  { id: "confirmation_request", label: ui.notifications.lineEventConfirmationRequest },
  { id: "error", label: ui.notifications.lineEventError },
  { id: "todays_schedule", label: ui.notifications.lineEventTodaysSchedule },
  { id: "morning_briefing", label: ui.notifications.lineEventMorningBriefing },
];

export function NotificationSettings() {
  const [prefs, setPrefs] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES,
  );
  const [line, setLine] = useState<LineConnectionState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [lineBusy, setLineBusy] = useState(false);
  const [lineMessage, setLineMessage] = useState<string | null>(null);

  useEffect(() => {
    void fetchNotificationPreferences().then(setPrefs).catch(() => undefined);
    void fetch("/api/line/connection")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data) setLine(data as LineConnectionState);
      })
      .catch(() => undefined);

    // Fire once-per-day LINE digests when settings/home loads with LINE on
    void fetch("/api/line/digest", { method: "POST" }).catch(() => undefined);
  }, []);

  const save = async (patch: Partial<NotificationPreferences>) => {
    setSaving(true);
    setSaved(false);
    try {
      const next = await updateNotificationPreferences(patch);
      setPrefs(next);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const runLineAction = async (action: string, enabled?: boolean) => {
    setLineBusy(true);
    setLineMessage(null);
    try {
      const response = await fetch("/api/line/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, enabled }),
      });
      const data = (await response.json()) as LineConnectionState & {
        message?: string;
        linkCode?: { code: string; expiresAt: string };
      };
      if (!response.ok) {
        setLineMessage(data.message ?? ui.notifications.lineActionFailed);
        return;
      }
      setLine(data);
      if (data.linkCode) {
        setLineMessage(ui.notifications.lineCodeIssued(data.linkCode.code));
      } else if (action === "test") {
        setLineMessage(ui.notifications.lineTestSent);
      }
      const nextPrefs = await fetchNotificationPreferences();
      setPrefs(nextPrefs);
    } catch {
      setLineMessage(ui.notifications.lineActionFailed);
    } finally {
      setLineBusy(false);
    }
  };

  const masterDisabled = !prefs.allEnabled;
  const lineEventsDisabled = masterDisabled || !prefs.channels.line;

  return (
    <Card padding="lg" className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          {ui.notifications.settingsTitle}
        </h2>
        <p className="mt-2 text-sm text-[var(--foreground-muted)]">
          {ui.notifications.settingsDesc}
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">
          {ui.notifications.channelTitle}
        </h3>
        <ToggleRow
          label={ui.notifications.channelInApp}
          checked={prefs.channels.inApp}
          onChange={(checked) =>
            void save({ channels: { ...prefs.channels, inApp: checked } })
          }
        />
        <ToggleRow
          label={ui.notifications.channelEmail}
          description={ui.notifications.channelComingSoon}
          checked={prefs.channels.email}
          disabled
          onChange={() => undefined}
        />
        <ToggleRow
          label={ui.notifications.channelLine}
          description={
            line?.linked
              ? ui.notifications.lineLinked
              : ui.notifications.lineConnectHint
          }
          checked={prefs.channels.line}
          onChange={(checked) => {
            void save({ channels: { ...prefs.channels, line: checked } });
            void runLineAction("set_enabled", checked);
          }}
        />
        <ToggleRow
          label={ui.notifications.channelSlack}
          description={ui.notifications.channelComingSoon}
          checked={prefs.channels.slack}
          disabled
          onChange={() => undefined}
        />
        <ToggleRow
          label={ui.notifications.channelPush}
          description={ui.push.settingsDesc}
          checked={prefs.channels.push}
          disabled={masterDisabled}
          onChange={(checked) =>
            void save({ channels: { ...prefs.channels, push: checked } })
          }
        />
      </div>

      <div className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-4">
        <h3 className="text-sm font-semibold text-foreground">
          {ui.notifications.lineSetupTitle}
        </h3>
        <p className="text-xs text-[var(--foreground-muted)]">
          {ui.notifications.lineSetupDesc}
        </p>
        {!line?.configured && (
          <p className="text-xs text-[var(--foreground-muted)]">
            {ui.notifications.lineNotConfigured}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={lineBusy || !line?.configured}
            onClick={() => void runLineAction("issue_code")}
          >
            {ui.notifications.lineIssueCode}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={lineBusy || !line?.linked || !prefs.channels.line}
            onClick={() => void runLineAction("test")}
          >
            {ui.notifications.lineSendTest}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={lineBusy || !line?.linked}
            onClick={() => void runLineAction("disconnect")}
          >
            {ui.notifications.lineDisconnect}
          </Button>
        </div>
        {line?.botBasicId && (
          <p className="text-xs text-[var(--foreground-muted)]">
            {ui.notifications.lineBotId(line.botBasicId)}
          </p>
        )}
        {lineMessage && (
          <p className="text-sm text-[var(--status-success)]">{lineMessage}</p>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">
          {ui.notifications.lineEventsTitle}
        </h3>
        {LINE_EVENT_ROWS.map((row) => (
          <ToggleRow
            key={row.id}
            label={row.label}
            checked={prefs.lineEvents[row.id]}
            disabled={lineEventsDisabled}
            onChange={(checked) =>
              void save({
                lineEvents: { ...prefs.lineEvents, [row.id]: checked },
              })
            }
          />
        ))}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">
          {ui.notifications.typeTitle}
        </h3>
        <ToggleRow
          label={ui.notifications.prefAll}
          checked={prefs.allEnabled}
          onChange={(checked) => void save({ allEnabled: checked })}
        />
        <ToggleRow
          label={ui.notifications.prefCompleted}
          checked={prefs.completedEnabled}
          disabled={masterDisabled}
          onChange={(checked) => void save({ completedEnabled: checked })}
        />
        <ToggleRow
          label={ui.notifications.prefAwaitingReview}
          checked={prefs.awaitingReviewEnabled}
          disabled={masterDisabled}
          onChange={(checked) => void save({ awaitingReviewEnabled: checked })}
        />
        <ToggleRow
          label={ui.notifications.prefError}
          checked={prefs.errorEnabled}
          disabled={masterDisabled}
          onChange={(checked) => void save({ errorEnabled: checked })}
        />
        <ToggleRow
          label={ui.notifications.prefRecommendation}
          checked={prefs.recommendationEnabled}
          disabled={masterDisabled}
          onChange={(checked) => void save({ recommendationEnabled: checked })}
        />
        <ToggleRow
          label={ui.notifications.prefBilling}
          checked={prefs.billingEnabled}
          disabled={masterDisabled}
          onChange={(checked) => void save({ billingEnabled: checked })}
        />
        <ToggleRow
          label={ui.notifications.prefIntegration}
          checked={prefs.integrationEnabled}
          disabled={masterDisabled}
          onChange={(checked) => void save({ integrationEnabled: checked })}
        />
        <ToggleRow
          label={ui.notifications.prefAutomation}
          checked={prefs.automationEnabled}
          disabled={masterDisabled}
          onChange={(checked) => void save({ automationEnabled: checked })}
        />
      </div>

      {saved && (
        <p className="text-sm text-[var(--status-success)]">{ui.notifications.saved}</p>
      )}
      {saving && (
        <Button variant="secondary" size="sm" disabled>
          {ui.loading}
        </Button>
      )}
    </Card>
  );
}
