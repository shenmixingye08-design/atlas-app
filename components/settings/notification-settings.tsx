"use client";

import { useEffect, useState } from "react";

import {
  fetchNotificationPreferences,
  updateNotificationPreferences,
} from "@/lib/notifications/client";
import type { NotificationPreferences } from "@/lib/notifications/types";
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

export function NotificationSettings() {
  const [prefs, setPrefs] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES,
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void fetchNotificationPreferences().then(setPrefs).catch(() => undefined);
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

  const masterDisabled = !prefs.allEnabled;

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
          description={ui.notifications.channelComingSoon}
          checked={prefs.channels.line}
          disabled
          onChange={() => undefined}
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
          description={ui.notifications.channelComingSoon}
          checked={prefs.channels.push}
          disabled
          onChange={() => undefined}
        />
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
