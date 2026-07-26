"use client";

import { useEffect, useRef, useState } from "react";

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
import type { PushErrorCode } from "@/lib/push/errors";
import { pushErrorMessageJa } from "@/lib/push/errors";
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
    <label className="flex min-h-[44px] cursor-pointer items-start justify-between gap-4 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] px-4 py-3">
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
        className="mt-1 h-5 w-5 accent-accent"
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

type Feedback = {
  kind: "success" | "error" | "info";
  text: string;
  code?: string;
};

export function PushNotificationSettings() {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [draft, setDraft] = useState<NotificationPreferences["push"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [devices, setDevices] = useState<
    Awaited<ReturnType<typeof fetchPushDevices>>
  >([]);
  const [browser, setBrowser] = useState(() => detectPushBrowser());
  const [permission, setPermission] = useState<
    NotificationPermission | undefined
  >(undefined);
  const subscribeLock = useRef(false);

  const registered = devices.some((d) => d.isActive);
  const permissionState = resolvePushPermissionState(
    permission,
    registered,
    browser.supportsPush,
  );

  const refreshPermission = () => {
    setBrowser(detectPushBrowser());
    setPermission(
      typeof Notification !== "undefined" ? Notification.permission : undefined,
    );
  };

  const refresh = async () => {
    const [nextPrefs, nextDevices] = await Promise.all([
      fetchNotificationPreferences(),
      fetchPushDevices(),
    ]);
    setPrefs(nextPrefs);
    setDraft(nextPrefs.push);
    setDevices(nextDevices);
    refreshPermission();
  };

  useEffect(() => {
    refreshPermission();
    void refresh().catch(() => undefined);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        refreshPermission();
        void fetchPushDevices().then(setDevices).catch(() => undefined);
      }
    };
    const onFocus = () => {
      refreshPermission();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const savePreferences = async () => {
    if (!prefs || !draft) return;
    setSavingPrefs(true);
    setFeedback(null);
    try {
      const next = await updateNotificationPreferences({
        push: draft,
      });
      setPrefs(next);
      setDraft(next.push);

      if (!registered || permission !== "granted") {
        setFeedback({
          kind: "info",
          text: ui.push.settingsSavedPushInactive,
        });
      } else {
        setFeedback({ kind: "success", text: ui.push.settingsSaved });
      }
    } catch {
      setFeedback({ kind: "error", text: ui.push.settingsSaveFailed });
    } finally {
      setSavingPrefs(false);
    }
  };

  const requestPermissionAndSubscribe = async () => {
    if (subscribeLock.current || busy) return;
    if (permission === "denied" || !browser.supportsPush) return;

    subscribeLock.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      if (typeof Notification === "undefined") {
        setFeedback({
          kind: "error",
          text: ui.push.statusUnsupported,
          code: "push_not_supported",
        });
        return;
      }

      let nextPermission = Notification.permission;
      if (nextPermission === "default") {
        nextPermission = await Notification.requestPermission();
      }
      setPermission(nextPermission);

      if (nextPermission === "denied") {
        setFeedback({
          kind: "error",
          text: pushErrorMessageJa("permission_denied"),
          code: "permission_denied",
        });
        return;
      }
      if (nextPermission !== "granted") {
        setFeedback({
          kind: "error",
          text: pushErrorMessageJa("permission_dismissed"),
          code: "permission_dismissed",
        });
        return;
      }

      const sub = await subscribeToPush();
      if (!sub.ok) {
        const code = (sub.error ?? "push_subscription_failed") as PushErrorCode;
        setFeedback({
          kind: "error",
          text: pushErrorMessageJa(code),
          code,
        });
        return;
      }

      if (!prefs) {
        setFeedback({
          kind: "error",
          text: pushErrorMessageJa("authentication_required"),
          code: "authentication_required",
        });
        return;
      }

      const next = await updateNotificationPreferences({
        channels: { ...prefs.channels, push: true },
        push: draft ?? prefs.push,
      });
      setPrefs(next);
      setDraft(next.push);
      setFeedback({ kind: "success", text: ui.push.subscribeSuccess });
      await refresh();
    } finally {
      setBusy(false);
      subscribeLock.current = false;
    }
  };

  const disablePush = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      await unsubscribeFromPush();
      if (prefs) {
        const next = await updateNotificationPreferences({
          channels: { ...prefs.channels, push: false },
        });
        setPrefs(next);
      }
      setFeedback({ kind: "info", text: ui.push.unregistered });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const runTest = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const result = await sendTestPush();
      if (result.ok) {
        setFeedback({ kind: "success", text: ui.push.testSent });
      } else {
        const code = result.code ?? "delivery_failed";
        setFeedback({
          kind: "error",
          text: pushErrorMessageJa(code),
          code,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  if (!prefs || !draft) {
    return (
      <Card padding="lg" className="space-y-3">
        <p className="text-sm text-[var(--foreground-muted)]">{ui.push.loading}</p>
      </Card>
    );
  }

  const prefsDisabled = !prefs.allEnabled;
  const showEnableButton =
    browser.supportsPush &&
    permissionState !== "denied" &&
    permissionState !== "unsupported" &&
    (permissionState === "default" ||
      permissionState === "unregistered" ||
      !registered);

  return (
    <Card padding="lg" className="space-y-6 overflow-x-hidden">
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
          {permissionState === "denied" && ui.push.statusDenied}
          {permissionState === "granted" && ui.push.statusGranted}
          {permissionState === "default" && ui.push.statusDefault}
          {permissionState === "unregistered" && ui.push.statusUnregistered}
        </p>

        {permissionState === "default" && (
          <p className="mt-2 text-sm text-foreground">{ui.push.permissionPrompt}</p>
        )}

        {permissionState === "granted" && registered && (
          <p className="mt-2 text-xs text-[var(--foreground-muted)]">
            {ui.push.registeredDeviceHint}
          </p>
        )}

        {permissionState === "denied" && (
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-[var(--foreground-muted)]">
            <li>{ui.push.deniedStep1}</li>
            <li>{ui.push.deniedStep2}</li>
            <li>{ui.push.deniedStep3}</li>
            <li>{ui.push.deniedStep4}</li>
            <li>{ui.push.deniedStep5}</li>
            <li>{ui.push.deniedStep6}</li>
          </ol>
        )}
        {permissionState === "denied" && (
          <p className="mt-2 text-xs text-[var(--foreground-muted)]">
            {ui.push.deniedFallback}
          </p>
        )}

        {browser.isIos && !browser.isStandalone && (
          <p className="mt-2 text-xs text-[var(--foreground-muted)]">
            {ui.push.iosInstallGuide}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {showEnableButton && (
          <Button
            size="md"
            disabled={busy || permissionState === "denied"}
            isLoading={busy}
            onClick={() => void requestPermissionAndSubscribe()}
          >
            {ui.push.enableButton}
          </Button>
        )}

        {permissionState === "granted" && registered && (
          <>
            <Button
              size="md"
              variant="secondary"
              disabled={busy}
              isLoading={busy}
              onClick={() => void runTest()}
            >
              {ui.push.sendTest}
            </Button>
            <Button
              size="md"
              variant="secondary"
              disabled={busy}
              onClick={() => void disablePush()}
            >
              {ui.push.unregisterButton}
            </Button>
          </>
        )}

        {feedback?.kind === "error" &&
          feedback.code &&
          feedback.code !== "permission_denied" &&
          feedback.code !== "push_not_supported" && (
            <Button
              size="md"
              variant="secondary"
              disabled={busy}
              onClick={() => void requestPermissionAndSubscribe()}
            >
              {ui.push.retry}
            </Button>
          )}
      </div>

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
        <p className="text-xs text-[var(--foreground-muted)]">{ui.push.eventsHint}</p>
        {EVENT_ROWS.map((row) => (
          <ToggleRow
            key={row.id}
            label={row.label}
            checked={draft.events[row.id]}
            disabled={prefsDisabled || savingPrefs}
            onChange={(checked) =>
              setDraft({
                ...draft,
                events: { ...draft.events, [row.id]: checked },
              })
            }
          />
        ))}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">{ui.push.severityTitle}</h3>
        <p className="text-xs text-[var(--foreground-muted)]">{ui.push.severityHint}</p>
        {SEVERITY_ROWS.map((row) => (
          <ToggleRow
            key={row.id}
            label={row.label}
            checked={draft.severities[row.id]}
            disabled={prefsDisabled || savingPrefs}
            onChange={(checked) =>
              setDraft({
                ...draft,
                severities: { ...draft.severities, [row.id]: checked },
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
            className="mt-1 min-h-[44px] w-full rounded border border-[var(--border-subtle)] px-3 py-2"
            value={draft.quietHoursStart ?? ""}
            disabled={prefsDisabled || savingPrefs}
            onChange={(e) =>
              setDraft({
                ...draft,
                quietHoursStart: e.target.value || null,
              })
            }
          />
        </label>
        <label className="text-sm">
          <span className="font-medium text-foreground">{ui.push.quietEnd}</span>
          <input
            type="time"
            className="mt-1 min-h-[44px] w-full rounded border border-[var(--border-subtle)] px-3 py-2"
            value={draft.quietHoursEnd ?? ""}
            disabled={prefsDisabled || savingPrefs}
            onChange={(e) =>
              setDraft({
                ...draft,
                quietHoursEnd: e.target.value || null,
              })
            }
          />
        </label>
      </div>
      <p className="text-xs text-[var(--foreground-muted)]">{ui.push.quietHint}</p>

      <div className="flex flex-wrap gap-2">
        <Button
          size="md"
          variant="secondary"
          disabled={prefsDisabled || savingPrefs}
          isLoading={savingPrefs}
          onClick={() => void savePreferences()}
        >
          {ui.push.saveSettings}
        </Button>
      </div>

      {feedback && (
        <div
          className={
            feedback.kind === "error"
              ? "rounded-[var(--radius-lg)] border border-[var(--error)]/30 bg-[var(--error-bg)] px-4 py-3 text-sm text-[var(--error)]"
              : feedback.kind === "info"
                ? "rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-3 text-sm text-foreground"
                : "rounded-[var(--radius-lg)] border border-[var(--status-success)]/30 px-4 py-3 text-sm text-[var(--status-success)]"
          }
        >
          <p>{feedback.text}</p>
          {feedback.code && (
            <p className="mt-1 text-[10px] opacity-70">{feedback.code}</p>
          )}
        </div>
      )}
    </Card>
  );
}
