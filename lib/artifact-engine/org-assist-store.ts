"use client";

/**
 * Lightweight org / letterhead fields for artifact quality assist.
 * Separate from UserWorkProfile core — only used by Artifact Engine UI.
 */

export type OrgAssistProfile = {
  companyName?: string;
  contactName?: string;
  contactPhone?: string;
  companyPhone?: string;
  companyIntro?: string;
  logo?: string;
  serviceArea?: string;
  serviceDescription?: string;
  companyAddress?: string;
  invoiceRegistrationNumber?: string;
  bankAccount?: string;
  paymentDue?: string;
  channelName?: string;
  tone?: string;
  targetAudience?: string;
  cta?: string;
  updatedAt?: string;
};

const STORAGE_KEY = "minervot-org-assist-profile";

export function loadOrgAssistProfile(): OrgAssistProfile {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as OrgAssistProfile;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveOrgAssistProfile(
  patch: OrgAssistProfile,
): OrgAssistProfile {
  const next: OrgAssistProfile = {
    ...loadOrgAssistProfile(),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

export function clearOrgAssistProfile(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}
