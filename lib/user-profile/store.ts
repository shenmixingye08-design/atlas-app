"use client";

import {
  DEFAULT_USER_WORK_PROFILE,
  USER_WORK_PROFILE_VERSION,
  type DeliverableFormatPreference,
  type JobCategoryId,
  type ManualPreferenceEntry,
  type UserWorkProfile,
} from "./types";
import { normalizeOnboardingState } from "@/lib/onboarding/normalize";

const STORAGE_KEY = "atlas-user-work-profile";

const FORMAT_VALUES: DeliverableFormatPreference[] = [
  "pptx",
  "pdf",
  "docx",
  "md",
  "txt",
  "pptx_pdf",
  "docx_pdf",
];

function isFormat(value: unknown): value is DeliverableFormatPreference {
  return FORMAT_VALUES.includes(value as DeliverableFormatPreference);
}

function isJobCategory(value: unknown): value is JobCategoryId {
  return (
    value === "sales_material" ||
    value === "blog" ||
    value === "sns_post" ||
    value === "video" ||
    value === "email" ||
    value === "file_organize" ||
    value === "generic"
  );
}

function normalizeProfile(raw: Partial<UserWorkProfile>): UserWorkProfile {
  const frequentlyUsedJobs = Array.isArray(raw.frequentlyUsedJobs)
    ? raw.frequentlyUsedJobs.filter(
        (item) =>
          item &&
          isJobCategory(item.jobCategory) &&
          typeof item.label === "string" &&
          typeof item.count === "number",
      )
    : [];

  const preferredFormats: UserWorkProfile["preferredFormats"] = {};
  if (raw.preferredFormats && typeof raw.preferredFormats === "object") {
    for (const [key, value] of Object.entries(raw.preferredFormats)) {
      if (isJobCategory(key) && isFormat(value)) {
        preferredFormats[key] = value;
      }
    }
  }

  const preferredPostingTimes: UserWorkProfile["preferredPostingTimes"] = {};
  if (raw.preferredPostingTimes && typeof raw.preferredPostingTimes === "object") {
    for (const [key, value] of Object.entries(raw.preferredPostingTimes)) {
      if (
        isJobCategory(key) &&
        value &&
        typeof value === "object" &&
        typeof (value as { hour: number }).hour === "number"
      ) {
        preferredPostingTimes[key] = {
          hour: Math.min(23, Math.max(0, (value as { hour: number }).hour)),
          minute: Math.min(
            59,
            Math.max(0, (value as { minute?: number }).minute ?? 0),
          ),
        };
      }
    }
  }

  const manualOverrides = Array.isArray(raw.manualOverrides)
    ? raw.manualOverrides.filter(
        (item): item is ManualPreferenceEntry =>
          Boolean(item?.id && isJobCategory(item.jobCategory) && item.label),
      )
    : [];

  return {
    version: USER_WORK_PROFILE_VERSION,
    frequentlyUsedJobs,
    preferredFormats,
    preferredPostingTimes,
    jobSettings:
      raw.jobSettings && typeof raw.jobSettings === "object"
        ? raw.jobSettings
        : {},
    manualOverrides,
    onboarding: normalizeOnboardingState(raw.onboarding),
    updatedAt:
      typeof raw.updatedAt === "string"
        ? raw.updatedAt
        : DEFAULT_USER_WORK_PROFILE.updatedAt,
  };
}

export function loadUserWorkProfile(): UserWorkProfile {
  if (typeof window === "undefined") {
    return DEFAULT_USER_WORK_PROFILE;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_USER_WORK_PROFILE;
    return normalizeProfile(JSON.parse(raw) as Partial<UserWorkProfile>);
  } catch {
    return DEFAULT_USER_WORK_PROFILE;
  }
}

export function saveUserWorkProfile(profile: UserWorkProfile): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

export function updateUserWorkProfile(
  patch: Partial<UserWorkProfile>,
): UserWorkProfile {
  const next = normalizeProfile({
    ...loadUserWorkProfile(),
    ...patch,
    updatedAt: new Date().toISOString(),
  });
  saveUserWorkProfile(next);
  return next;
}

export function resetUserWorkProfile(): UserWorkProfile {
  const reset = {
    ...DEFAULT_USER_WORK_PROFILE,
    updatedAt: new Date().toISOString(),
  };
  saveUserWorkProfile(reset);
  return reset;
}

export function hasUserWorkProfile(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) !== null;
}
