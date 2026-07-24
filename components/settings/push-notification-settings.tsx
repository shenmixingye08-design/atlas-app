"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  fetchPushDevices,
  sendTestPush,
  setDeviceActive,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push/client";
import {
  detectPushBrowser,
  resolvePushPermissionState,
} from "@/lib/push/browser-detect";
import type { PushEventCategory, PushSeverity } from "@/lib/push/types";
import {
  fetchNotificationPreferences,
  updateNotificationPreferences,
} from "@/lib/notifications/client";
import type { NotificationPreferences } from "@/lib/notifications/types";
import { ui } from "@/lib/i18n";

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

const EVENT_ROWS: { id: PushEventCategory; label: string }[] = [
  { id: "final_success", label: ui.push.eventFinalSuccess },
  { id: "final_failure", label: ui.push.eventFinalFailure },
  { id: "approval_needed", label: ui.push.eventApprovalNeeded },
  { id: "connection_broken", label: ui.push.eventConnectionBroken },
  { id: "daily_report", label: ui.push.eventDailyReport },
  { id: "auto_recovered", label: ui.push.eventAutoRecovered },
];

const SEVERITY_ROWS: { id: PushSeverity; label: string }[] = [
  { id: "critical", label: ui.push.severityCritical },
  { id: "important", label: ui.push.severityImportant },
  { id: "summary", label: ui.push.severitySummary },
  { id: "info", label: ui.push.severityInfo },
];

export function PushNotificationSettings() {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [showExplain, setShowExplain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [devices, setDevices] = useState<
    Awaited<ReturnType<typeof fetchPushDevices>>
  >([]);
  const [browser, setBrowser] = useState(() => detectPushBrowser());
  const [permission, setPermission] = useState<
    NotificationPermission | undefined
  >(undefined);
  const registered = devices.some((d) => d.isActive);
  const permissionState = resolvePushPermissionState(
    permission,
    registered,
    browser.supportsPush,
  );

  const refresh = async () => {
    const [nextPrefs, nextDevices] = await Promise.all([
      fetchNotificationPreferences(),
      fetchPushDevices(),
    ]);
    setPrefs(nextPrefs);
    setDevices(nextDevices);
  };

  useEffect(() => {
    setBrowser(detectPushBrowser());
    setPermission(
      typeof Notification !== "undefined" ? Notification.permission : undefined,
    );
    void refresh().catch(() => undefined);
  }, []);

  const savePushPatch = async (
    patch: Partial<NotificationPreferences["push"]>,
  ) => {
    if (!prefs) return;
    setBusy(true);
    try {
      const next = await updateNotificationPreferences({
        push: { ...prefs.push, ...patch },
      });
      setPrefs(next);
    } finally {
      setBusy(false);
    }
  };

  const enablePush = async () => {
    setShowExplain(true);
  };

  const requestPermissionAndSubscribe = async () => {
    setBusy(true);
    setMessage(null);
    try {
      if (typeof Notification === "undefined") {
        setMessage(ui.push.statusUnsupported);
        return;
      }
      const result = await Notification.requestPermission();
      if (result !== "granted") {
        setMessage(ui.push.statusDenied);
        return;
      }
      const sub = await subscribeToPush();
      if (!sub.ok) {
        setMessage(ui.push.subscribeFailed(sub.error ?? ""));
        return;
      }
      await updateNotificationPreferences({
        channels: { ...prefs!.channels, push: true },
      });
      setMessage(ui.push.subscribeSuccess);
      await refresh();
    } finally {
      setBusy(false);
      setShowExplain(false);
    }
  };

  const disablePush = async () => {
    setBusy(true);
    try {
      await unsubscribeFromPush();
      await updateNotificationPreferences({
        channels: { ...prefs!.channels, push: false },
      });
      setMessage(ui.push.unregistered);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const runTest = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await sendTestPush();
      setMessage(result.ok ? ui.push.testSent : (result.message ?? ui.push.testFailed));
    } finally {
      setBusy(false);
    }
  };

  if (!prefs) return null;

  const pushDisabled = !prefs.allEnabled || !prefs.channels.push;

  return (
    <Card padding="lg" className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{ui.push.settingsTitle}</h2>
        <p className="mt-2 text-sm text-[var(--foreground-muted)]">
          {ui.push.settingsDesc}
        </p>
      </div>

      <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-4 text-sm">
        <p className="font-medium text-foreground">{ui.push.statusTitle}</p>
        <p className="mt-1 text-[var(--foreground-muted)]">
          {permissionState === "unsupported" && ui.push.statusUnsupported}
          {permissionState === "denied" && ui.push.statusDeniedGuide}
          {permissionState === "granted" && ui.push.statusGranted}
          {permissionState === "default" && ui.push.statusDefault}
          {permissionState === "unregistered" && ui.push.statusUnregistered}
        </p>
        {browser.isIos && !browser.isStandalone && (
          <p className="mt-2 text-xs text-[var(--foreground-muted)]">
            {ui.push.iosInstallGuide}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {!prefs.channels.push ? (
          <Button size="sm" disabled={busy || !browser.supportsPush} onClick={() => void enablePush()}>
            {ui.push.enableButton}
          </Button>
        ) : (
          <>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void runTest()}>
              {ui.push.sendTest}
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void disablePush()}>
              {ui.push.unregisterButton}
            </Button>
          </>
        )}
      </div>

      {showExplain && (
        <div className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4">
          <p className="text-sm text-foreground">{ui.push.permissionExplain}</p>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => void requestPermissionAndSubscribe()}>
              {ui.push.permissionAllow}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setShowExplain(false)}>
              {ui.actions.cancel}
            </Button>
          </div>
        </div>
      )}

      {devices.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">{ui.push.devicesTitle}</h3>
          {devices.map((device) => (
            <ToggleRow
              key={device.id}
              label={
                device.deviceName ||
                `${device.platform ?? "device"} / ${device.browser ?? "browser"}`
              }
              description={new Date(device.updatedAt).toLocaleString("ja-JP")}
              checked={device.isActive}
              onChange={(checked) => {
                void setDeviceActive(device.id, checked).then(refresh);
              }}
            />
          ))}
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">{ui.push.eventsTitle}</h3>
        {EVENT_ROWS.map((row) => (
          <ToggleRow
            key={row.id}
            label={row.label}
            checked={prefs.push.events[row.id]}
            disabled={pushDisabled}
            onChange={(checked) =>
              void savePushPatch({
                events: { ...prefs.push.events, [row.id]: checked },
              })
            }
          />
        ))}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">{ui.push.severityTitle}</h3>
        {SEVERITY_ROWS.map((row) => (
          <ToggleRow
            key={row.id}
            label={row.label}
            checked={prefs.push.severities[row.id]}
            disabled={pushDisabled}
            onChange={(checked) =>
              void savePushPatch({
                severities: { ...prefs.push.severities, [row.id]: checked },
              })
            }
          />
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="font-medium text-foreground">{ui.push.quietStart}</span>
          <input
            type="time"
            className="mt-1 w-full rounded border border-[var(--border-subtle)] px-3 py-2"
            value={prefs.push.quietHoursStart ?? ""}
            disabled={pushDisabled}
            onChange={(e) =>
              void savePushPatch({
                quietHoursStart: e.target.value || null,
              })
            }
          />
        </label>
        <label className="text-sm">
          <span className="font-medium text-foreground">{ui.push.quietEnd}</span>
          <input
            type="time"
            className="mt-1 w-full rounded border border-[var(--border-subtle)] px-3 py-2"
            value={prefs.push.quietHoursEnd ?? ""}
            disabled={pushDisabled}
            onChange={(e) =>
              void savePushPatch({
                quietHoursEnd: e.target.value || null,
              })
            }
          />
        </label>
      </div>

      {message && (
        <p className="text-sm text-[var(--status-success)]">{message}</p>
      )}
    </Card>
  );
}
