# Kept

**Meeting notes that keep their proof — and track whether promises actually happen across calls.**

Record a meeting from the browser (microphone, Chrome meeting-tab audio + mic with no bot, or file upload), transcribe it with speaker labels (including Hindi-English code-switching), and extract decisions and commitments — **each backed by a verified verbatim quote and timestamp**. When a later meeting with the same people is processed, Kept's **Commitment Ledger** automatically checks every open promise and marks it `done`, `in_progress`, `changed`, or `dropped` (after 2 consecutive meetings with the owner present and no mention), with proof.

---

## Live Links

- **Live App:** Deployed on Vercel from [`neoquantx/meto`](https://github.com/neoquantx/meto) (open `/demo` on the deployed URL for the read-only 3-meeting Commitment Ledger walkthrough, or click **Try it** to sign in anonymously and record your own)
- **Read-Only Demo Story:** `/demo` (`/demo/meetings`, `/demo/ledger`, `/demo/decisions`, `/demo/brief`)
- **Health Check:** `/api/health`

---

## What We Kept from Fathom

Fathom is rated 5.0 on G2 from 7,017 reviews ([G2](https://ai.g2.com/product/fathom-video)) with 400,000+ monthly active users ([TechCrunch](https://techcrunch.com/2026/09/14/superhuman-acquires-yc-backed-notetaker-fathom-as-productivity-platforms-push-for-agentic-work/)). We kept the core loop users love:

1. **Playback synced with the transcript** — click any transcript line, chapter, or quote chip to jump the player to that exact second; toggle `Follow playback` to auto-scroll as audio plays.
2. **Speaker diarization and reassignment** — utterances are grouped by speaker label and mapped to persistent people across your workspace (`people` + `meeting_speakers`), with AI name-hint suggestions from spoken introductions (*"Hi, I'm Rahul"*).
3. **Custom vocabulary / glossary** — workspace terms in `/settings` are passed to Deepgram Nova-3 as `keyterm` parameters so names and product jargon transcribe cleanly.
4. **Full-text search across meetings** — `/meetings` searches both titles and transcript lines (`simple` tsvector configuration so English and Devanagari tokens aren't mangled by English stemming) with matching snippets and timestamp links.
5. **Fast sharing** — one-click read-only links for either the whole meeting or a single participant (`/share/[token]`), with instant revocation.

---

## What We Changed and Why (Research Summary)

Complaints about AI notetakers cluster *after* the call: trust, follow-through across meetings, capture flexibility, multilingual calls, and privacy. Below are the 8 specific gaps documented in `docs/research.md`, with sources and how Kept closes each one.

### 1. Summaries are too long and nobody reads them
- **Evidence:** Users complain that AI overviews *"span the length of 2 word docs. I either don't read it..."* ([r/corporate](https://www.reddit.com/r/corporate/comments/1tl5182/im_sick_of_the_ai_meeting_overviews_that_get_sent/)), project managers spend an hour editing each AI recap ([r/projectmanagement](https://www.reddit.com/r/projectmanagement/comments/1w0383c/please_tell_me_honestly_how_long_it_takes_you_to/)), and Capterra reviewers note summaries are padded ([Capterra](https://www.capterra.com/p/276054/Fathom/)).
- **What we changed:**
  - Hard cap on TL;DR: **at most 3 bullets, each ≤ 25 words**.
  - **Who owes what** panel on every meeting: grouped by person, omitting suggestions, rejected items, and already-completed tasks.
  - **Per-person share links** (`/share/[token]`): shows only that person's commitments and transcript lines, with an explicit *"Nothing for you in this meeting."* state when they owe nothing.

### 2. Promises get lost between meetings (Headline Feature: Commitment Ledger)
- **Evidence:** *"The summary gets written, nobody reads it, the actions get lost... What matters is whether anything got dropped between meeting 12 and meeting 40"* ([r/aiToolForBusiness](https://www.reddit.com/r/aiToolForBusiness/comments/1u7bf9s/are_meeting_summaries_solving_the_wrong_problem/), [r/AiNoteTaker](https://www.reddit.com/r/AiNoteTaker/comments/1wtaztu/at_what_point_did_we_start_needing_an_ai_tool_for/)). In Fathom, action items only change status via manual checkmarks or paid/scoped Asana sync ([Fathom Asana docs](https://help.fathom.video/en/articles/7639617)).
- **What we changed:**
  - **Commitment Ledger (`/ledger`):** When speakers are named on meeting $M$, Kept finds all active commitments (`open`, `in_progress`, `changed`) from earlier meetings involving those people and checks them against $M$'s transcript.
  - Each status transition (`done`, `in_progress`, `changed`) requires a **verified verbatim quote** from the later meeting. If the quote fails verification, the result is downgraded to `not_mentioned`.
  - **Silence is a signal:** If a commitment is `not_mentioned` in **2 consecutive meetings where its owner was present**, its status automatically becomes `dropped` (*silently dropped*).
  - **Pre-meeting brief (`/brief`) & Decision log (`/decisions`):** Pick who will be in your next call to see their open, in-progress, changed, and dropped commitments plus the last 5 decisions from meetings with them — a pure database query with zero LLM latency or hallucination.

### 3. People can't trust AI action items (Evidence-First Extraction)
- **Evidence:** A benchmark of 6 notetakers (including Fathom) across 73 meetings found every tool missed conditional tasks and invented *"phantom action items"* ([Mursa](https://www.mursa.me/blog/ai-note-taker-meeting-action-items)); users report misattributed owners and hallucinated decisions ([G2](https://ai.g2.com/product/fathom-video), [Capterra](https://www.capterra.com/p/276054/Fathom/reviews/?page=11), [Coommit](https://coommit.com/blog/ai-meeting-summary-hallucinations-2026)).
- **What we changed (`src/lib/verify.ts`):**
  - **Mandatory quote verification:** Every decision and commitment must cite a `segment_idx` and verbatim `quote`. The server normalizes text (NFC, lowercase, preserving Unicode letters, numbers, and combining marks `\p{L}\p{N}\p{M}` for Devanagari) and checks that the quote is a substring of segments `segment_idx - 1 .. segment_idx + 1` or has ≥ 85% token overlap. Items that fail are dropped, and the UI displays `"N items dropped: no evidence"`.
  - **Code-decided ownership:** The LLM never guesses a person's name for ownership. If `owner_mode === 'self'`, the owner is the speaker of `segment_idx`. If `owner_mode === 'assigned'`, it is valid **only** if `acknowledged_segment_idx` falls within the next 3 segments and has a different speaker who agreed; otherwise it remains `Unassigned`.
  - **Kind separation:** Commitments are classified as `explicit`, `conditional` (keeping the `If ...` condition), or `suggestion` (hedges like *"maybe we should..."* are excluded from "Who owes what" and the Ledger).
  - **Deterministic due dates:** Spoken due phrases (`"by Friday"`) must appear in the verified quote and are resolved in code with `chrono-node` (`forwardDate: true`) against `meetings.recorded_at`.
  - **Human review:** Confirm / Reject buttons on every extracted commitment and decision.

### 4. No file upload, weak in-person capture, no Android
- **Evidence:** Fathom does not support uploaded recordings ([Fathom FAQ](https://help.fathom.video/en/categories/72000)) and has no Android app ([Litmus](https://litmustools.com/review/fathom/)).
- **What we changed:** One unified pipeline for browser microphone recording (desktop + mobile browsers), Chrome tab + mic capture, and audio/video file uploads (`audio/*`, `video/*` up to 50 MB and 90 minutes).

### 5. Hinglish (Hindi and English mixed in the same sentence)
- **Evidence:** Fathom's translated summaries cover only 6 European languages ([Fathom languages](https://help.fathom.video/en/articles/296192)), and Deepgram's built-in PII redaction is English-only ([Deepgram redaction](https://developers.deepgram.com/docs/redaction)).
- **What we changed:**
  - Deepgram `nova-3` with `language=multi` for intra-sentence Hindi-English code-switching ([Deepgram code-switching](https://developers.deepgram.com/docs/multilingual-code-switching.mdx)).
  - Summary language selector (`English`, `Hindi`, `Hinglish`) per meeting and as a workspace default.
  - Unicode-aware quote verification (`\p{L}\p{N}\p{M}`) and language-independent regex redaction (`src/lib/redact.ts`).

### 6. Recording failures and holes in transcripts
- **Evidence:** 342 G2 mentions of recording problems and unexplained multi-minute transcript gaps ([G2](https://www.g2.com/it/products/fathom-video/reviews?qs=pros-and-cons), [Reddit](https://www.reddit.com/r/buhaydigital/comments/1bcatxr/fathom_ai_vs_fireflies_ai_vs_otter_ai/)).
- **What we changed:**
  - `MediaRecorder.start(5000)` writes every 5-second audio chunk immediately to IndexedDB (`idb-keyval`). If the tab reloads or crashes mid-call, a **Recover unfinished recording** banner rebuilds the Blob in order and uploads it; local chunks are deleted only after the server confirms `uploaded`.
  - Live `AnalyserNode` RMS microphone level meter with a warning if audio stays near-silent for 30 seconds, plus Screen Wake Lock and `beforeunload` protection.
  - Stretches > 30 seconds between consecutive transcript segments render a clickable `"Silence or untranscribed — listen"` marker in the transcript (`src/lib/transcript-gaps.ts`).

### 7. Privacy, consent, and data ownership
- **Evidence:** Class-action privacy lawsuits against AI notetakers over unconsented recording and training ([Computerworld](https://www.computerworld.com/article/4219742/ai-notetakers-at-work-could-leave-companies-at-risk-for-lawsuits.html), [Bloomberg Law](https://news.bloomberglaw.com/litigation/otter-ai-stuck-with-privacy-lawsuit-over-meeting-transcriptions)) and Trustpilot complaints about losing recordings with no bulk export ([Trustpilot](https://au.trustpilot.com/review/fathom.video)).
- **What we changed:**
  - Mandatory **Consent gate** before recording (`consent_at` + optional spoken consent note stored on the meeting row).
  - **Off the record** button pauses recording (`MediaRecorder.pause()`) and inserts an `"Off the record (paused N min)"` marker on the timeline.
  - Deepgram `mip_opt_out=true` on every transcription request.
  - Regex redaction (`[redacted]`) of emails, phone numbers, and 13–19 digit card numbers on all public share links and exports.
  - One-click **Export all** (`kept-export.zip` containing redacted Markdown and JSON for every meeting via `fflate`) and **Delete all** (wipes storage objects and database rows).

### 8. The visible meeting bot (top complaint by volume: 415 G2 mentions)
- **Evidence:** Having a bot join as a call participant is the #1 complaint on G2 ([G2 pros and cons](https://www.g2.com/it/products/fathom-video/reviews?qs=pros-and-cons)).
- **What we changed:** Zero bots. On desktop Chrome, **Meeting tab + mic** uses `getDisplayMedia({ video: true, audio: true })`, immediately stops the video track, and mixes the tab audio stream with the user's microphone through Web Audio API (`AudioContext` + `MediaStreamDestination`).

---

## What We Cut and Why (Product Judgement & Tradeoffs)

- **Calendar connector (Google Calendar / Outlook):** Connecting Google Calendar or Outlook requires OAuth scopes, a redirect flow, and matching calendar events to recordings. We chose to spend that build budget on the **Commitment Ledger**, which is the core feature separating Kept from Fathom. On `/meetings/new`, the **Meeting date and time** field acts as the stand-in: you set when the meeting happened, and the Ledger evaluates promises in that chronological order. If extended, a post-call calendar webhook would fire when a meeting ends and pre-fill the title and attendee list.
- **Structural summary templates (`sales call`, `1:1`, etc.):** The user research showed that the biggest complaint wasn't the structural shape of the summary — it was the excessive length and lack of follow-through across calls. We solved length with a hard **3-bullet TL;DR cap** (≤ 25 words each) and follow-through with the **Commitment Ledger**, while exposing a **Summary language** selector (`English`, `Hindi`, `Hinglish`) that controls how the summary is written. If structural templates were needed next, we would expose a single custom prompt prefix field in `/settings` that applies to every extraction.
- **Live scrolling transcript & mid-call highlights:** Cut intentionally because research shows live transcripts compete with active listening — participants end up reading the screen instead of staying in the conversation. Instead, we built **post-call quote chips** on every commitment and decision: each chip is a clickable timestamp that jumps the player to the exact second the promise or decision was spoken. That is the moment that matters when reviewing with someone who wasn't in the room. A live mid-call bookmark button would be a one-day addition if product direction changed.
- **The meeting bot:** Top user complaint in Fathom's G2 reviews (415 mentions). Instead, on Chrome desktop, **Meeting tab + mic** uses `getDisplayMedia` to capture the Zoom or Meet tab's audio and mixes in your microphone through the Web Audio API — no bot joins the call, nobody gets a notification, and nothing appears in the participant list.
- **Isolated 30-second audio clip files on share links:** Share links (`Share meeting` / `Share [Name]`) are read-only, PII-redacted links that support deep-linked timestamps (`/share/[token]?t=...`) so the recipient lands directly on the relevant moment in the transcript and can jump between quote timestamps. Slicing isolated 30-second audio files would require server-side audio transcoding (`ffmpeg`), whereas deep-linked timestamp shares deliver 80% of the value — sending someone the exact moment a decision was made — while keeping raw audio private.
- **CRM sync, sales scorecards, talk-time & sentiment metrics:** Enterprise sales add-ons that clutter individual and small-team follow-through; users report talk-time percentages are *"interesting for about a day"* ([r/AiNoteTaker](https://www.reddit.com/r/AiNoteTaker/comments/1wtaztu/at_what_point_did_we_start_needing_an_ai_tool_for/)).

---

## Multi-Speaker & Hour-Long Calls (8-Person Call Architecture)

While the demo walkthrough uses a 2-person call and a 3-meeting ledger sequence, the architecture is built to handle 8-person, hour-long meetings:
- **Diarization & duration caps:** Deepgram `nova-3` with `diarize=true` separates up to 8+ speakers, uploads allow up to **90 minutes** (and 50 MB), and the `simple` GIN `tsvector` index on `segments` keeps full-text transcript search fast as segment counts grow.
- **Cross-call Ledger scaling:** The Commitment Ledger (`src/lib/ledger-check.ts`) queries and checks open promises across all named speakers in the meeting regardless of participant count.
- **Where it gets bumpy at 8 speakers (and how we guard against it):** With 8 speakers over an hour, the extraction prompt grows longer and interleaved crosstalk makes LLM JSON output more prone to misattributing owners or hallucinating quotes. Kept's verification layer (`src/lib/verify.ts`) specifically guards against this:
  1. Every commitment and decision quote is verified against a 3-segment window (`segment_idx - 1 .. segment_idx + 1`); unverified items are dropped and tallied in `dropped_count` (*"N items were dropped because no supporting evidence was found"*), never silently included.
  2. Ownership is resolved in deterministic code rather than trusting the LLM's speaker guess (`self` requires the speaker of `segment_idx`; `assigned` requires a different speaker's explicit acknowledgement within the next 3 segments).

---

## Free-Tier Caveats & Known Limitations

1. **Gemini free-tier data usage:** Google's unpaid Gemini API tier may use submitted prompts and transcripts to improve Google products ([Gemini API pricing & terms](https://ai.google.dev/gemini-api/docs/pricing)). Use non-sensitive audio on the free tier; a production deployment should use a paid billing account where data logging is disabled.
2. **Ledger date-order limitation:** A meeting checks and updates commitments from meetings with an earlier `recorded_at` timestamp. If you upload historical meetings out of chronological order, set the **Meeting date and time** field when creating the meeting (or click **Re-check ledger** after naming speakers).
3. **Supabase Free limits:** Uploads are capped at 50 MB (and 90 minutes) per file, and a per-user daily cap (`DAILY_AUDIO_MINUTES_CAP`, default 120 minutes/day) prevents quota exhaustion. Because Supabase pauses free projects after 7 days of inactivity, `vercel.json` configures a daily cron job hitting `/api/health`.
4. **Mobile web recording:** Mobile OSes suspend backgrounded browser tabs when the phone screen locks. Kept acquires the Screen Wake Lock API and shows a reminder banner on mobile devices.

---

## Architecture

```
Browser (Next.js App Router Client Components)
  ├── Mic / Chrome Tab+Mic (Web Audio API) ──► 5s chunks saved to IndexedDB (idb-keyval)
  ├── Signed Upload URL ─────────────────────► Supabase Storage (private `audio` bucket)
  └── Stepwise Pipeline Orchestration:
        1. POST /api/meetings               (create meeting row + signed upload URL)
        2. POST /api/meetings/[id]/uploaded (verify size ≤ 50 MB, duration ≤ 90m, daily cap)
        3. POST /api/meetings/[id]/transcribe
             └── Deepgram Nova-3 (`language=multi`, `diarize=true`, `mip_opt_out=true`, `keyterm`)
             └── Saves `segments` (with `simple` GIN tsvector) + `meeting_speakers` + `usage_daily`
        4. POST /api/meetings/[id]/extract
             └── Gemini (`@google/genai`, strict JSON schema + Zod validation)
             └── Pure verification (`src/lib/verify.ts`): quote substring/85% token check,
                 code-decided owner (`self` / `assigned` with 3-segment ack), `chrono-node` due dates
        5. POST /api/meetings/[id]/speakers
             └── Maps speakers to workspace `people`, assigns `commitments.owner_person_id`
             └── Runs Commitment Ledger check (`src/lib/ledger-check.ts`) against earlier open promises,
                 verifies proof quotes, replays `commitment_events`, marks 2x silence as `dropped`
```

- **Database & Auth:** Supabase Postgres (Mumbai region) + Anonymous Sign-In. Every table has Row Level Security enabled with **no client policies**; all reads and writes go through Next.js server routes/components using the service-role client after verifying the user's session (`getUserOrThrow()` / `requireApiUser()`).

---

## Local Setup & Deployment

### 1. Prerequisites
- Node.js 20+
- A free [Supabase](https://supabase.com) project (with **Anonymous Sign-Ins** enabled under *Authentication → Providers → Anonymous*)
- A [Deepgram](https://deepgram.com) API key ($200 free credit)
- A [Google AI Studio (Gemini)](https://aistudio.google.com) API key

### 2. Database Migration
Open the Supabase **SQL Editor** and run the full contents of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql). This creates all tables, indexes, RLS rules, `service_role` grants, and the private `audio` storage bucket (50 MB limit).

### 3. Environment Variables
Copy `.env.example` to `.env.local` and fill in your keys:

```bash
cp .env.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
DEEPGRAM_API_KEY=<your-deepgram-key>
GEMINI_API_KEY=<your-gemini-key>
GEMINI_MODEL=gemini-2.5-flash
GROQ_API_KEY=                         # optional
CRON_SECRET=<random-secret-string>
DAILY_AUDIO_MINUTES_CAP=120
DEMO_OWNER_ID=                        # optional: UUID from /settings to power /demo from your DB
```

### 4. Install & Run
```bash
npm install
npm run dev
```

Verify checks:
```bash
npm run typecheck
npm run lint
npm test
npm run build
```

### 5. Recording the 3 Demo Meetings (`DEMO_OWNER_ID`)
By default, `/demo` includes a built-in fallback of the 3-meeting Commitment Ledger story so it works out of the box. To serve your own recorded demo meetings and audio on `/demo`:
1. Click **Try it** on `/` to sign in, and record the 3 meetings in Section 12 of [`docs/plan.md`](docs/plan.md) (*Launch planning* on Oct 20, *Weekly sync* on Oct 22 in Hinglish, *Pre-launch check* on Oct 24), naming speakers `Himanshu` and `Rahul` on each.
2. Open `/settings`, click **Copy ID** under **Account ID**, and set `DEMO_OWNER_ID=<copied-uuid>` in `.env.local` and in your Vercel project's Environment Variables, then redeploy.
