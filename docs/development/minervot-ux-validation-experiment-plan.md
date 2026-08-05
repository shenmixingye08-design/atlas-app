# MINERVOT UX Validation Experiment Plan

**Status:** Research protocol only. No product changes in this document.  
**Rule:** Prior design reviews, simulated user studies, and “probably confuses / probably quits” statements are **hypotheses**. They must not drive improvements until replaced by measured data from this protocol.  
**Owner role for this phase:** UX Research Lead (observation and decision criteria only).

---

## 0. Premises (non-negotiable)

1. Everything reviewed so far is hypothesis, not evidence.
2. Forbidden until real data exists:
   - design review
   - hypothesis review (“たぶん迷う / たぶん閉じる”)
   - feature addition
   - UI/copy improvements justified only by opinion
3. Allowed:
   - recruit users
   - run sessions
   - record (with consent)
   - code observations on the sheet below
   - decide PASS / FAIL / IMPROVE from thresholds only

**Improvement rule:** Change product only when a measured item hits its **改善条件**. Change only that item’s root cause. No drive-by redesign.

---

## 1. What we are validating

**Primary job under test (fixed for this phase):**

> 画像または資料を渡して、仕事用の文書が手元に残るまで。

One job only. Do not mix jobs across the same cohort until Cohort A finishes.

**Build under test:** Record URL + commit SHA + date at session start. Do not change build mid-cohort.

---

## 2. Sample sizes — what each n can support

| n | What you may conclude | What you must not conclude |
|---|------------------------|----------------------------|
| **5** | First friction map: where eyes go, first tap, first freeze. Qualitative themes only. | Rates, “users like it,” ship/no-ship. |
| **10** | Recurring confusion vs one-offs. Rough completion band. | Segmentation, marketing claims. |
| **20** | Directional rates on completion, time-to-input, close reasons. Enough to pick **one** fix target. | World-class claim. |
| **50** | Decision-grade rates for success/fail gates. Segment by job type / device if powered. | Still not “all users worldwide.” |

**Stop rules**

- After **5**: stop adding features; only refine the observation sheet if coding was ambiguous.
- After **10**: if the same first-confusion appears in ≥5/10, that item is the sole candidate for the next measured fix (after full cohort log is closed).
- After **20**: apply success/fail/improve thresholds in §8.
- After **50**: re-run the same job; compare before/after on the same metrics only.

---

## 3. Observation metrics (exact definitions)

Every session fills one row. Times are wall-clock from **first paint of home** unless noted.

| ID | Metric | How to measure | Coding notes |
|----|--------|----------------|--------------|
| M01 | **5秒以内に何を見るか** | First 5.0s of screen recording; note AOI (areas of interest) in order | AOI list fixed: Brand, Headline, Input, 任せる, Sidebar, Other. Mark primary focus at t=5s. |
| M02 | **最初に押す場所** | First click/tap after first paint | Same AOI list + Outside. If scroll-then-tap, still first tap target. |
| M03 | **入力まで何秒** | Time from first paint to first character in the work input (or first paste) | If they never type → `null` + mark abandoned. |
| M04 | **最初の迷い** | First pause ≥3s with no productive action, or first verbal “わからない/どれ?” | Timestamp + AOI + verbatim quote (JP). One row only: the **first** confusion. |
| M05 | **閉じる理由** | If session ends without Done: reason from exit interview + last screen | Categories closed-set: Don’t know what to type / Too many options / Looks like chat / Error/fail / Too slow / Got result elsewhere / Other (free text). |
| M06 | **仕事完了率** | Binary: reached honest Done for the assigned job within 15 minutes | Done = user can open/download/use the deliverable without researcher help. Assisted completions count as Fail for M06 (log assist separately). |
| M07 | **完了時間** | First paint → Done timestamp | Fail sessions: leave blank; store last stage reached. |
| M08 | **紹介したくなる瞬間** | Timestamp of first spontaneous referral signal | Signals: “これ友達に見せたい”, share lean-in, screenshot to send someone, explicit NPS-like “薦めたい”. If none → none. |
| M09 | **笑った瞬間** | Timestamp of first genuine laugh/smile at product moment | Not polite smile at facilitator. Tag trigger (copy / result / surprise). |
| M10 | **イライラした瞬間** | Timestamp of first clear frustration | Signals: sigh, curse, rage-click (≥3 rapid taps), “うざい”, leaving tab. |
| M11 | **二回目も使うか** | Forced choice after session | はい / たぶん / いいえ + one sentence why. Do not coach. |

### Derived (computed after coding, not guessed live)

- **Time-to-first-meaningful-action:** min(M03, first tap that is Input or 任せる)
- **Confusion rate:** sessions with M04 coded / n
- **Referral moment rate:** M08 not none / n
- **Frustration-before-Done rate:** M10 before M07 among completers

---

## 4. Protocol by cohort size

### 4.1 n = 5 — Friction discovery

**Goal:** Learn *where* to look on video, not whether the product is good.

**Method**

1. Moderated, think-aloud (light): “思ったことをそのまま言ってください。正解はありません。”
2. Task card (read aloud once, then silent):

   > あなたの仕事で使う文書を、MINERVOTに作ってもらってください。  
   > 手元にある写真か資料を使って構いません。  
   > できたら「これが仕事で使える」と思ったものを残してください。

3. No demo. No hint unless safety (data loss / account lock).
4. Cap 15 minutes. Then exit interview (§6).

**What you may decide after 5**

- Observation sheet is usable / needs clearer AOI.
- List of **candidate** friction themes (not fixes).

**What you may not decide after 5**

- Ship, redesign home, add features.

### 4.2 n = 10 — Pattern confirmation

**Same method as n=5.** Add:

- Code each M01–M11 independently by a second rater on ≥3 sessions; resolve disagreements.
- Mark each M04 theme with count (e.g. “sidebar first” 4/10).

**Decision allowed:** Rank friction themes by frequency. Still no product change until §8 gates on n≥20 (or n=10 emergency only if ≥8/10 identical hard fail on M06 — see §8).

### 4.3 n = 20 — Directional ship/fail

Same task. Prefer mix:

- 10 desktop / 10 mobile (or as close as recruit allows)
- At least 10 who have never used MINERVOT/ATLAS

Compute rates for M06, M03 median, M05 distribution, M11.

Apply §8 thresholds.

### 4.4 n = 50 — Decision cohort

Same job. Stratify if possible:

- Device, first-time vs returning, job subtype (photo-led vs text-led)

Only after n=50 (or after a measured fix + retest of 20) may you claim “improved.”

---

## 5. Video review checklist

Watch at 1x for first pass. Second pass may be 1.5x only for waiting segments.

### 5.1 Before play

- [ ] Consent on file (record + use for product improvement)
- [ ] Build URL / SHA / date logged
- [ ] Participant ID (P01…) — no real name in sheet
- [ ] Device + browser logged
- [ ] Task version ID logged (`job-doc-v1`)

### 5.2 First 5 seconds (M01)

- [ ] Note gaze/attention order using AOI list only
- [ ] At t=5.0s, mark **primary** AOI
- [ ] Note if eyes bounce ≥3 AOIs (label: `scan-heavy`) — observation only, not judgment
- [ ] Note if face leans in / pulls back (optional body code)

### 5.3 First action (M02, M03)

- [ ] Timestamp of first pointer move toward UI
- [ ] First tap target + timestamp
- [ ] First keystroke/paste timestamp (M03)
- [ ] If first tap ≠ Input and ≠ 任せる → code `off-path-first-tap` + target

### 5.4 First confusion (M04)

- [ ] First ≥3s idle OR first confusion utterance
- [ ] Screen at that moment (screenshot still)
- [ ] Verbatim quote
- [ ] Did they recover alone? Y/N
- [ ] If recovered: next successful action

### 5.5 Path to Done (M06, M07)

- [ ] Stage markers: typed / submitted / progress seen / result visible / opened deliverable
- [ ] Any researcher assist? If yes → M06 = Fail; log assist type
- [ ] Error screens: copy exact message
- [ ] Double-ask moments: count of times user re-enters same intent
- [ ] Tab switches / app switches count

### 5.6 Affect moments (M08–M10)

- [ ] Laugh: timestamp + trigger object on screen
- [ ] Frustration: timestamp + trigger + behavior code (sigh / rage-click / leave)
- [ ] Referral lean: timestamp + exact words
- [ ] If none of the above: explicitly mark `none` (do not invent)

### 5.7 End state

- [ ] Final screen still
- [ ] Deliverable opened? Y/N
- [ ] User states usable for work? Y/N/Unsure (from their words, not yours)
- [ ] Close reason category if not Done (M05)
- [ ] M11 answer recorded before any debrief explanation

### 5.8 Coding hygiene

- [ ] No “they seemed confused” without timestamp
- [ ] No “probably would churn” — only M05/M11
- [ ] Second rater on disagreements for M04/M06/M08–M10
- [ ] Sheet locked when cohort closes (no retroactive soft edits)

---

## 6. Session script (facilitator)

### 6.1 Opening (≤60s)

1. Purpose: product improvement, not testing the person.
2. Think aloud optional but welcome.
3. You will not help unless stuck for safety.
4. Recording consent.

### 6.2 Task

Show task card once. Start timer at first paint after they confirm ready.

### 6.3 During

Allowed facilitator lines only:

- “そのままで大丈夫です”
- “思ったことを言ってください”
- “時間になったら止めます”

Forbidden:

- Explaining MINERVOT
- Pointing at 任せる
- “ここに書いて”
- Any feature tour

### 6.4 Exit interview (fixed order — read as written)

1. 最初の5秒で、画面の何が目に入りましたか？（自由回答 → map to AOI after）
2. 最初に押した（押そうとした）場所はどこですか？ なぜですか？
3. 入力するまで、迷いましたか？ 何に？
4. 途中でやめたいと思った瞬間はありましたか？ 理由は？
5. 仕事は終わりましたか？ 終わったと言える根拠は何ですか？
6. 誰かに紹介したくなった瞬間はありましたか？ いつ？
7. 笑った／気持ちが楽になった瞬間は？
8. イライラした瞬間は？
9. **二回目も使いますか？** はい / たぶん / いいえ。一文で理由。
10. （任意・最後）他に一言だけ。

Do not discuss roadmap. Do not defend the product.

---

## 7. Data sheet (minimum columns)

```
participant_id
date
build_url
build_sha
device
browser
cohort (5|10|20|50)
M01_aoi_order
M01_primary_at_5s
M02_first_tap
M02_first_tap_ms
M03_time_to_input_ms
M04_first_confusion_ms
M04_theme
M04_quote
M05_close_reason
M06_completed (0/1)
M07_complete_ms
M08_referral_ms_or_none
M09_laugh_ms_or_none
M10_frustration_ms_or_none
M11_reuse (yes|maybe|no)
M11_why
assist_used (0/1)
notes_factual_only
```

Store raw videos separately with matching `participant_id`. Retention: per privacy policy; delete on request.

---

## 8. Success / Fail / Improve conditions

Thresholds apply to the **assigned job** on the **frozen build**.  
Use **n≥20** for ship/fail decisions unless Emergency rule triggers.

### 8.1 Success conditions (PASS — keep build; no UX change required for this job)

All must hold on n≥20:

| Metric | PASS |
|--------|------|
| M06 仕事完了率 | ≥ 70% unassisted |
| M03 入力まで | median ≤ 20s |
| M02 最初に押す場所 | ≥ 60% Input or 任せる |
| M05 閉じる理由 | top reason ≠ “Too many options” and ≠ “Don’t know what to type” at ≥40% of non-completers |
| M11 二回目も使うか | (はい + たぶん) ≥ 60% |
| M10 before Done among completers | ≤ 40% |

### 8.2 Fail conditions (FAIL — do not scale marketing; do not add features)

Any one on n≥20:

| Metric | FAIL |
|--------|------|
| M06 | < 40% |
| M03 median | > 60s |
| M02 off-path first tap | ≥ 60% |
| M11 いいえ | ≥ 50% |
| M05 | ≥ 50% of all sessions close with “Don’t know what to type” or “Too many options” |

**Emergency FAIL (n=10):** If M06 < 20% (≤1/10) **and** same M04 theme in ≥8/10 → freeze feature work; run root-cause observation workshop on those 8 videos only; still no redesign until written measurement of the single cause.

### 8.3 Improve conditions (IMPROVE — one change allowed)

On n≥20, pick **exactly one** change when PASS fails but FAIL is not met, or when PASS holds but a single metric is the clear drag:

| Trigger (measured) | Allowed change class (still after data) |
|--------------------|----------------------------------------|
| M02 off-path ≥40% and modal AOI = Sidebar | Reduce/remove that AOI on first screen only |
| M03 median >20s and M04 theme = don’t know what to type ≥40% | Change empty-state/prompt affordance only (no new features) |
| M06 mid (40–69%) and drop-off stage = after 任せる form re-ask | Remove re-ask on that path only |
| M06 mid and drop-off = progress/error | Reliability/copy of that stage only |
| M10 rate high and trigger = waiting with no status | Status clarity only |
| M08 none in ≥90% and M06≥70% | Study completion moment copy/timing only (delight), no new modules |

**Hard rules for IMPROVE**

1. One change per retest cycle.
2. Retest with **n=20** (or n=50 if previous was 50) on the **same job**.
3. Keep / revert based only on whether the triggered metric moved past its PASS line without tanking M06.

---

## 9. Analysis rules (anti-hypothesis)

1. Do not write “users will…” — write “in this sample, n=X, Y% …”
2. Themes need count + example IDs (P03, P07).
3. Quotes beat adjectives.
4. If video and interview disagree, video wins for M01–M04/M06–M10; interview wins for M11 and M05 category confirmation.
5. No composite “delight score” until M08/M09 have operational definitions met for ≥10 events total across cohort.

---

## 10. World-level UX experiment plan (MINERVOT)

Goal of this program: earn the right to say the product finishes a real job for real people — with numbers, not narrative.

### 10.1 Program structure

| Phase | n | Method | Output |
|-------|---|--------|--------|
| A Discovery | 5 | Moderated + video | Friction map + sheet validation |
| B Pattern | +5 (total 10) | Same | Theme frequencies |
| C Decision | +10 (total 20) | Same + device mix | PASS / FAIL / IMPROVE |
| D Confirm | +30 (total 50) or retest 20 after one fix | Same job | Stable rates |
| E Retention probe | 20 from prior completers, day 7 | Unmoderated return task | M11 behavioral: did they return? |

Phases A→C must complete before any product IMPROVE. Phase E is measurement of return, not a new feature.

### 10.2 Experiment method (standard session)

- **Recruit:** People who create work documents at least weekly (sales, ops, creators, students with reports). Exclude team members and spouses of team.
- **Incentive:** Fair local rate; paid after session regardless of completion.
- **Environment:** Their device when possible; else lab device matching their OS.
- **Moderation:** 1 facilitator + 1 silent note-taker (or facilitator + later video code).
- **Duration:** 15 min task + 10 min exit interview.
- **Artifact:** Video + sheet row + deliverable file hash if completed.

### 10.3 Questions (canonical set)

Use §6.4 only. Do not add “Would you pay?” until PASS on M06 for two consecutive cohorts.

### 10.4 Success condition (world-level bar for this job)

On **n=50** (or two independent n=20 with same build):

- M06 ≥ 80% unassisted  
- M03 median ≤ 15s  
- M02 on-path ≥ 70%  
- M11 はい ≥ 40% and いいえ ≤ 20%  
- M08 referral moment ≥ 25%  
- M10-before-Done among completers ≤ 25%  
- Phase E: ≥ 40% of invited completers return and complete the same job class within 7 days without prompt spam

Until these hold, do not claim world-class UX. Claim only cohort stats.

### 10.5 Failure condition (program-level)

- Two consecutive Decision cohorts (n=20) hit FAIL (§8.2), or  
- After three IMPROVE cycles, M06 still < 50% on n=20  

Then: stop UI iteration; run job-definition research (is this the wrong first job?) with a **new** protocol — still measurement-first, not brainstorm-first.

### 10.6 Improve condition (program-level)

- Exactly one IMPROVE trigger from §8.3  
- One change  
- Retest  
- Publish before/after table for the triggered metric + M06 guardrail  

No parallel redesign tracks.

---

## 11. Operating cadence

| Cadence | Action |
|---------|--------|
| Per session | Fill sheet within 24h |
| Per 5 | Theme list update (counts only) |
| Per 20 | PASS/FAIL/IMPROVE vote from numbers only |
| Per fix | Retest n=20 same job |
| Weekly | Raw video backlog = 0 for closed cohort |

**Roles**

- UX Research Lead: protocol integrity, coding standards  
- Note-taker: timestamps  
- Product: no attendance in live sessions (watch video after coding lock)  
- Eng: frozen build tagging only

---

## 12. Explicit non-goals for this phase

- No new features  
- No speculative UX essays  
- No competitor narrative as evidence  
- No changing the job mid-cohort  
- No “AI personality” experiments until M06 PASS

---

## 13. Acknowledgement log

| Item | Status |
|------|--------|
| Prior design reviews | Hypothesis — not evidence |
| Prior simulated 10-user scores | Hypothesis — not evidence |
| Prior “users will confuse/quit” claims | Forbidden as decisions |
| Sole input to improvement | Rows in the data sheet from real sessions |

---

## 14. Immediate next actions (research ops only)

1. Freeze build SHA for Cohort A.  
2. Recruit 5 participants matching §10.2.  
3. Print AOI list + task card `job-doc-v1`.  
4. Run 5 sessions; lock sheet.  
5. Do not schedule eng UX work until §8 triggers on sufficient n.

**End of protocol.**
