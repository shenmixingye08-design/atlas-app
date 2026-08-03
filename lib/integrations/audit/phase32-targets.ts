/**
 * Phase 3-1 → Phase 3-2 target selection (max 5 services).
 */

import type { Phase32Target } from "./types";

export const PHASE_32_TARGETS: readonly Phase32Target[] = [
  {
    rank: 1,
    serviceId: "google_drive",
    adopt: true,
    reasons: [
      "Highest habit reduction: save deliverables without manual upload",
      "Already has live upload provider + webViewLink/fileId evidence",
      "OAuth durable in Supabase (needs encryption hardening)",
      "Stable Google Drive API; verifiable without public posting",
      "Direct value for ¥980 / 1000-user scale via document workflows",
    ],
  },
  {
    rank: 2,
    serviceId: "gmail",
    adopt: true,
    reasons: [
      "Core secretary job: draft/send without leaving ATLAS",
      "Live UI/API exists; V2 step already registered (needs wiring)",
      "Shared Google OAuth already provisioned",
      "Evidence via draftId/messageId; no public side effects if draft-first",
      "High monthly value for recurring mail work",
    ],
  },
  {
    rank: 3,
    serviceId: "google_calendar",
    adopt: true,
    reasons: [
      "Recurring schedule creation reduces calendar copy/paste",
      "Live UI/API exists; V2 step registered",
      "Shares Google OAuth; low incremental credential cost",
      "eventId + htmlLink are strong completion evidence",
      "Idempotency must be fixed before wide automation enablement",
    ],
  },
  {
    rank: 4,
    serviceId: "dropbox",
    adopt: true,
    reasons: [
      "Alternate storage for users not on Drive",
      "UI/API upload/share already implemented",
      "Must first move tokens off process-memory (P0 blocker)",
      "V2 step registered; wiring after durable credentials",
      "Verifiable privately without social posting risk",
    ],
  },
  {
    rank: 5,
    serviceId: "wordpress",
    adopt: true,
    reasons: [
      "Draft/publish recurring content without CMS login",
      "Encrypted Application Password store already production-shaped",
      "postId + URL evidence available",
      "V2 step registered; needs adapter wiring + durable idempotency",
      "Clear paid-plan value for content operators",
    ],
  },
  {
    rank: 6,
    serviceId: "x",
    adopt: false,
    reasons: [
      "Legacy live posting exists but Vercel/OAuth/posting constraints make safe production proof hard",
      "Public side effects / dual-post risk elevated",
      "Plaintext tokens + in-process dedupe insufficient for scale",
      "Defer after Drive/Gmail/Calendar/Dropbox/WordPress",
    ],
  },
  {
    rank: 7,
    serviceId: "slack",
    adopt: false,
    reasons: ["UI/catalog only — no OAuth/adapter"],
  },
  {
    rank: 8,
    serviceId: "discord",
    adopt: false,
    reasons: ["UI/catalog only — no OAuth/adapter"],
  },
  {
    rank: 9,
    serviceId: "notion",
    adopt: false,
    reasons: ["Stub connect only"],
  },
  {
    rank: 10,
    serviceId: "line",
    adopt: false,
    reasons: ["Notification channel, not V2 external work completion path"],
  },
  {
    rank: 11,
    serviceId: "microsoft_outlook",
    adopt: false,
    reasons: ["Unsupported / coming soon"],
  },
  {
    rank: 12,
    serviceId: "microsoft_teams",
    adopt: false,
    reasons: ["Unsupported / coming soon"],
  },
  {
    rank: 13,
    serviceId: "webhook",
    adopt: false,
    reasons: ["Unsupported outbound implementation"],
  },
  {
    rank: 14,
    serviceId: "push_notification",
    adopt: false,
    reasons: ["Already notification infrastructure — not Phase 3-2 work adapter"],
  },
  {
    rank: 15,
    serviceId: "supabase_storage",
    adopt: false,
    reasons: ["Internal storage already Production Live"],
  },
  {
    rank: 16,
    serviceId: "s3_r2",
    adopt: false,
    reasons: ["Unsupported / not implemented"],
  },
  {
    rank: 17,
    serviceId: "email_delivery",
    adopt: false,
    reasons: ["Covered via Gmail target"],
  },
  {
    rank: 18,
    serviceId: "youtube",
    adopt: false,
    reasons: ["Stub only"],
  },
] as const;

export function adoptedPhase32Targets(): Phase32Target[] {
  return PHASE_32_TARGETS.filter((target) => target.adopt).slice(0, 5);
}

export function rejectedPhase32Targets(): Phase32Target[] {
  return PHASE_32_TARGETS.filter((target) => !target.adopt);
}
