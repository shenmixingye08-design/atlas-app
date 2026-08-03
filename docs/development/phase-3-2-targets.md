# Phase 3-2 Targets — External Live Adapter Implementation

Generated from Phase 3-1 External Live Adapter Audit.

## Adopted (max 5)

### 1. `google_drive`

- Highest habit reduction: save deliverables without manual upload
- Already has live upload provider + webViewLink/fileId evidence
- OAuth durable in Supabase (needs encryption hardening)
- Stable Google Drive API; verifiable without public posting
- Direct value for ¥980 / 1000-user scale via document workflows

### 2. `gmail`

- Core secretary job: draft/send without leaving ATLAS
- Live UI/API exists; V2 step already registered (needs wiring)
- Shared Google OAuth already provisioned
- Evidence via draftId/messageId; no public side effects if draft-first
- High monthly value for recurring mail work

### 3. `google_calendar`

- Recurring schedule creation reduces calendar copy/paste
- Live UI/API exists; V2 step registered
- Shares Google OAuth; low incremental credential cost
- eventId + htmlLink are strong completion evidence
- Idempotency must be fixed before wide automation enablement

### 4. `dropbox`

- Alternate storage for users not on Drive
- UI/API upload/share already implemented
- Must first move tokens off process-memory (P0 blocker)
- V2 step registered; wiring after durable credentials
- Verifiable privately without social posting risk

### 5. `wordpress`

- Draft/publish recurring content without CMS login
- Encrypted Application Password store already production-shaped
- postId + URL evidence available
- V2 step registered; needs adapter wiring + durable idempotency
- Clear paid-plan value for content operators

## Rejected / Deferred

- **x**: Legacy live posting exists but Vercel/OAuth/posting constraints make safe production proof hard; Public side effects / dual-post risk elevated; Plaintext tokens + in-process dedupe insufficient for scale; Defer after Drive/Gmail/Calendar/Dropbox/WordPress
- **slack**: UI/catalog only — no OAuth/adapter
- **discord**: UI/catalog only — no OAuth/adapter
- **notion**: Stub connect only
- **line**: Notification channel, not V2 external work completion path
- **microsoft_outlook**: Unsupported / coming soon
- **microsoft_teams**: Unsupported / coming soon
- **webhook**: Unsupported outbound implementation
- **push_notification**: Already notification infrastructure — not Phase 3-2 work adapter
- **supabase_storage**: Internal storage already Production Live
- **s3_r2**: Unsupported / not implemented
- **email_delivery**: Covered via Gmail target
- **youtube**: Stub only

## Non-goals for Phase 3-2

- Full OAuth redesign beyond encryption/durable storage needs
- Scheduler / Queue / Worker / Memory core changes
- Implementing Slack/Discord/Notion/Outlook/Teams/Webhook/S3
- Unauthorized live posting to X
