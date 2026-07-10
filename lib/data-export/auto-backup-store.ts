"use client";

import type { AutoBackupSettings, AutoBackupSchedule } from "./types";

const STORAGE_KEY = "atlas-auto-backup-settings";

const DEFAULT_SETTINGS: AutoBackupSettings = {
  schedule: "manual",
  lastRunAt: null,
  lastRunStatus: null,
  enabled: false,
};

function readSettings(): AutoBackupSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AutoBackupSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      schedule: isSchedule(parsed.schedule) ? parsed.schedule : "manual",
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function isSchedule(value: unknown): value is AutoBackupSchedule {
  return value === "manual" || value === "weekly" || value === "monthly";
}

function writeSettings(settings: AutoBackupSettings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function loadAutoBackupSettings(): AutoBackupSettings {
  return readSettings();
}

export function saveAutoBackupSettings(
  patch: Partial<AutoBackupSettings>,
): AutoBackupSettings {
  const next = { ...readSettings(), ...patch };
  writeSettings(next);
  return next;
}

export function isAutoBackupDue(
  settings: AutoBackupSettings,
  now = Date.now(),
): boolean {
  if (!settings.enabled || settings.schedule === "manual") return false;
  if (!settings.lastRunAt) return true;

  const last = new Date(settings.lastRunAt).getTime();
  if (Number.isNaN(last)) return true;

  const intervalMs =
    settings.schedule === "weekly"
      ? 7 * 24 * 60 * 60 * 1000
      : 30 * 24 * 60 * 60 * 1000;

  return now - last >= intervalMs;
}
