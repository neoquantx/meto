# Build plan: "Kept" (Fathom-inspired meeting notetaker)

This file is the single source of truth. Each chat builds **one chunk**, then hands over to a fresh chat.

---

## 0. Rules for the AI agent (read first)

1. Read this whole file before doing anything. Read `docs/research.md` only when writing the README or when you need the reason behind a decision.
2. Do **exactly one chunk** per chat (see section 9). Check the Progress section first to find the next chunk.
3. If anything in the chunk is unclear, or you want to change a fixed decision (section 2), **ask the user first** with a short multiple-choice question. Never silently change the plan.
4. Keep usage low. The user is a student with a limited Cursor budget.
   - No web searches unless an API call fails and you need the docs.
   - Don't re-read files you just wrote, and don't paste large files back to the user.
   - Batch your edits. Verify with `npm run typecheck`, `npm run lint`, `npm run build` and the unit tests, not long dev-server sessions.
5. Never ask the user to paste secrets into chat. They edit `.env.local` themselves, and the Vercel env settings for production.
6. Before writing code against a library, check its installed major version in `package.json` and follow that version's API. For example, in recent Next.js versions `params` and `cookies()` are async.
7. If the user pastes the official assignment brief, save it to `docs/brief.md`, compare it with this plan, and list any conflicts **before** coding.
8. At the end of every chunk:
   - Run typecheck, lint, build and tests, and fix any failures.
   - **Do not commit or push.** The user does all git and GitHub work himself. Instead, remind him to commit the chunk together with `.agent-logs/` (suggested message: `chunk N: <short summary>`).
   - Update section 10 (Progress): tick the chunk and note any deviations or leftovers.
   - Give the user at most 5 manual test steps.
   - End with exactly: **"Chunk N is done. Start a new chat and send: `Read docs/plan.md and do Chunk N+1.`"**
9. If a chunk turns out too big for one chat, stop at a clean point, commit, write what's left in Progress, and tell the user to continue in a new chat with: `Read docs/plan.md and finish Chunk N.`

---

## 1. Product in one paragraph

A web app that records meetings (mic, browser-tab audio, or file upload), transcribes them with speaker labels (Hindi-English mixing supported), and extracts decisions and commitments, **each backed by a verified quote and timestamp**. Its headline feature is the **Commitment Ledger**: when a later meeting with the same people is processed, each open promise is automatically marked done, in progress, changed, or silently dropped, with proof. Also: a short "who owes what" recap, a pre-meeting brief, consent and off-the-record controls, redacted share links, and one-click export. No meeting bot.

The 8 gaps this closes, with evidence, are in `docs/research.md`.

---

## 2. Fixed decisions (don't change without asking)

| Area | Decision |
|---|---|
| Framework | Next.js (App Router), TypeScript (strict), Tailwind, shadcn/ui |
| Hosting | Vercel Hobby (function max 300 s), deploy from GitHub |
| Database, storage, auth | Supabase Free, Mumbai region |
| Auth | Supabase **anonymous sign-in** ("Try it" button). Each user owns their data via `owner_id = auth.uid()` |
| DB access | **Server-side only** (route handlers or server actions) with the service-role key, after reading the user from the Supabase session. RLS is enabled on every table with **no policies**, so direct client access is denied |
| Storage | Private bucket `audio`, 50 MB file limit. Uploads use server-made **signed upload URLs**; playback uses short-lived signed URLs |
| Transcription | Deepgram pre-recorded `POST /v1/listen` with JSON `{url}` (signed URL). Params: `model=nova-3`, `language=multi`, `diarize_model=latest`, `utterances=true`, `smart_format=true`, `mip_opt_out=true`, repeated `keyterm=` from the glossary. If Deepgram rejects `keyterm` with `multi`, retry once without it and log a warning |
| LLM | Google Gemini via `@google/genai`, model from env `GEMINI_MODEL` (default `gemini-2.5-flash`), JSON output with a response schema; validate everything with zod |
| Groq | Optional fallback (Whisper, no speaker labels). Stretch only |
| Redaction | Our own regex (emails, phone numbers, 13–19 digit card-like numbers), applied when rendering share pages and exports. The owner sees the original. Deepgram `redact` is **not** used (English-only, extra cost) |
| Dates | `chrono-node` resolves spoken due dates against the meeting date. The code decides the date, not the LLM |
| Local recording storage | IndexedDB via `idb-keyval` |
| Zip export | `fflate` |
| IDs and tokens | `crypto.randomUUID()` and `nanoid` (24 chars for share tokens) |
| Tests | `vitest` for pure logic (quote verification, owner resolution, redaction, dates, gap detection) |
| Quotas | Per-user daily cap on processed audio (`DAILY_AUDIO_MINUTES_CAP`, default 120). Uploads capped at 50 MB and 90 minutes. Gemini 429 shows "Daily AI limit reached, try again tomorrow" |
| Keep-alive | Vercel cron once a day calling `/api/health` (a tiny DB query), so Supabase doesn't pause the project |

### Environment variables (`.env.example`)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=        # publishable/anon key
SUPABASE_SERVICE_ROLE_KEY=            # secret, server only
DEEPGRAM_API_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
GROQ_API_KEY=                         # optional
CRON_SECRET=                          # random string; Vercel sends it as Bearer token to cron
DAILY_AUDIO_MINUTES_CAP=120
DEMO_OWNER_ID=                        # set in Chunk 8 (auth user id that owns the demo meetings)
```

---

## 3. Data model (`supabase/migrations/0001_init.sql`)

The user runs this SQL in the Supabase SQL Editor. Every table gets `enable row level security` and no policies.

```sql
create extension if not exists pgcrypto;

create table meetings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  title text not null default 'Untitled meeting',
  recorded_at timestamptz not null default now(),
  duration_sec int,
  source text not null check (source in ('mic','tab','upload')),
  audio_path text,
  mime_type text,
  summary_language text not null default 'en',          -- 'en' | 'hi' | 'hinglish'
  status text not null default 'created' check (status in
    ('created','uploaded','transcribing','transcribed','extracting','ready','failed')),
  error text,
  consent_at timestamptz,
  consent_note text,
  off_record_ranges jsonb not null default '[]',          -- [{at_ms, paused_ms}] on the audio timeline
  tldr jsonb not null default '[]',                       -- string[] (max 3)
  chapters jsonb not null default '[]',                   -- [{title, segment_idx, start_ms}]
  dropped_count int not null default 0,                   -- AI items rejected for missing evidence
  ledger_checked_at timestamptz,
  created_at timestamptz not null default now()
);
create index on meetings (owner_id, recorded_at desc);

create table segments (
  id bigserial primary key,
  meeting_id uuid not null references meetings(id) on delete cascade,
  idx int not null,
  speaker int not null,
  start_ms int not null,
  end_ms int not null,
  text text not null,
  tsv tsvector generated always as (to_tsvector('simple', text)) stored,
  unique (meeting_id, idx)
);
create index on segments using gin (tsv);

create table people (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  name text not null,
  created_at timestamptz not null default now()
);
create unique index on people (owner_id, lower(name));

create table meeting_speakers (
  meeting_id uuid not null references meetings(id) on delete cascade,
  speaker int not null,
  person_id uuid references people(id) on delete set null,
  name_hint text,                                          -- from AI ("Hi, I'm Rahul")
  primary key (meeting_id, speaker)
);

create table decisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  meeting_id uuid not null references meetings(id) on delete cascade,
  text text not null,
  quote text not null,
  segment_idx int not null,
  start_ms int not null,
  review text not null default 'pending' check (review in ('pending','confirmed','rejected')),
  created_at timestamptz not null default now()
);

create table commitments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  meeting_id uuid not null references meetings(id) on delete cascade,
  text text not null,
  kind text not null check (kind in ('explicit','conditional','suggestion')),
  condition text,
  owner_speaker int,                                       -- diarization label; resolved to person later
  owner_person_id uuid references people(id) on delete set null,
  due_phrase text,
  due_date date,
  quote text not null,
  segment_idx int not null,
  start_ms int not null,
  review text not null default 'pending' check (review in ('pending','confirmed','rejected')),
  status text not null default 'open' check (status in ('open','in_progress','changed','done','dropped')),
  misses int not null default 0,                           -- consecutive meetings where owner present but not mentioned
  change_note text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index on commitments (owner_id, status);

create table commitment_events (
  id uuid primary key default gen_random_uuid(),
  commitment_id uuid not null references commitments(id) on delete cascade,
  meeting_id uuid not null references meetings(id) on delete cascade,
  status text not null check (status in ('done','in_progress','changed','not_mentioned')),
  quote text,
  segment_idx int,
  start_ms int,
  note text,
  created_at timestamptz not null default now()
);

create table shares (
  token text primary key,
  owner_id uuid not null,
  meeting_id uuid not null references meetings(id) on delete cascade,
  person_id uuid references people(id) on delete cascade,  -- null = whole meeting
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

create table settings (
  owner_id uuid primary key,
  glossary text[] not null default '{}',
  summary_language text not null default 'en'
);

create table usage_daily (
  owner_id uuid not null,
  day date not null,
  audio_minutes numeric not null default 0,
  primary key (owner_id, day)
);

-- enable RLS everywhere (no policies => only service role can access)
alter table meetings enable row level security;
alter table segments enable row level security;
alter table people enable row level security;
alter table meeting_speakers enable row level security;
alter table decisions enable row level security;
alter table commitments enable row level security;
alter table commitment_events enable row level security;
alter table shares enable row level security;
alter table settings enable row level security;
alter table usage_daily enable row level security;

-- Grant full access to service_role
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all routines in schema public to service_role;

alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on routines to service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values ('audio', 'audio', false, 52428800)
on conflict (id) do nothing;
```

Audio path convention: `{owner_id}/{meeting_id}.{ext}`.

---

## 4. Processing pipeline

Each step is a separate route, so none comes close to Vercel's 300 s limit. Each is safe to retry and updates `meetings.status`. The client runs them in order, shows progress, and offers **Retry** on failure.

1. `POST /api/meetings`: create the meeting row (source, title, consent, off-record ranges), return a signed upload URL.
2. Client uploads the audio to the signed URL, then calls `POST /api/meetings/[id]/uploaded` with duration and mime type. Server checks size, duration and the daily cap, then sets `uploaded`.
3. `POST /api/meetings/[id]/transcribe`:
   - Deepgram on a signed read URL.
   - Build `segments` from `results.utterances` (`start`/`end` in seconds become ms; `speaker`; `transcript`).
   - Create `meeting_speakers` rows.
   - Add the minutes to `usage_daily`.
   - Status becomes `transcribed`.
4. `POST /api/meetings/[id]/extract`: Gemini extraction (section 5), verification, insert decisions and commitments, set TL;DR, chapters, name hints and `dropped_count`. Status becomes `ready`.
5. `POST /api/meetings/[id]/speakers`:
   - Save the speaker-to-person mapping (creating people by name if needed).
   - Update `commitments.owner_person_id` from `owner_speaker`.
   - Then run the ledger check (section 6) if not done yet; it can also be re-run from a button.

Transcript lines sent to the LLM: `[S{idx}] [Speaker {n}] [{mm:ss}] {text}`.

---

## 5. AI extraction contract (Gemini to zod)

Prompt rules:
- Use only the transcript.
- **An empty list is a correct answer.**
- `quote` must be copied verbatim, in its original language and script.
- `text` fields are written in the summary language.
- Hedges ("maybe", "we could", "we should think about") are `suggestion`, not tasks.
- "If X then Y" is `conditional`, with the condition kept.

```ts
{
  tldr: string[],                                   // max 3, each <= 25 words
  chapters: { title: string, segment_idx: number }[],
  decisions: { text: string, quote: string, segment_idx: number }[],
  commitments: {
    text: string,
    kind: 'explicit' | 'conditional' | 'suggestion',
    condition: string | null,
    owner_mode: 'self' | 'assigned' | 'unclear',    // self = speaker says "I'll..."
    acknowledged_segment_idx: number | null,        // for 'assigned': where the assignee agrees
    due_phrase: string | null,                      // exact words, e.g. "by Friday"
    quote: string,
    segment_idx: number
  }[],
  speaker_name_hints: { speaker: number, name: string, segment_idx: number }[]
}
```

### Verification (pure functions in `lib/verify.ts`, unit-tested)
- **Normalize:** NFC, lowercase, keep only Unicode letters and numbers (`\p{L}\p{N}`) plus single spaces. This keeps Devanagari.
- **Quote check:** the normalized quote must be a substring of the normalized text of segments `segment_idx-1 .. segment_idx+1`. Failing that, at least 85% of the quote's tokens must appear in that window. Otherwise **drop** the item and increment `dropped_count`.
- **Owner, decided by code from the data:**
  - `self`: `owner_speaker` = the speaker of `segment_idx`.
  - `assigned`: valid only if `acknowledged_segment_idx` exists, falls within the next 3 segments, and has a different speaker from the quote. Then `owner_speaker` = that segment's speaker. Otherwise it is unassigned.
  - `unclear`: unassigned (`owner_speaker = null`).
- **Due date:** keep `due_phrase` only if it appears in the normalized quote. `due_date` = chrono-node parse of `due_phrase`, relative to `recorded_at`, with `forwardDate: true`. Otherwise both are null.
- `start_ms` = the `start_ms` of `segment_idx`.
- Name hints are only shown as suggestions in the speaker-mapping UI. They are never applied automatically.

---

## 6. Ledger check contract (headline feature)

Runs for meeting M once its speakers are mapped.

- **Candidates:** commitments by the same `owner_id` with `status in ('open','in_progress','changed')`, `review != 'rejected'`, `kind != 'suggestion'`, from meetings whose `recorded_at` is earlier than M's, and whose `owner_person_id` is one of M's mapped people. Include unassigned ones too when their source meeting shares at least one person with M.
- **Gemini input:** the candidate list (`id`, text, owner name, due date, source meeting title and date) plus M's transcript lines.
- **Gemini output:**
  ```ts
  { results: { commitment_id: string, status: 'done'|'in_progress'|'changed'|'not_mentioned',
               quote: string | null, segment_idx: number | null, note: string | null }[] }
  ```
- **Verification:** for any status other than `not_mentioned`, the quote must pass the same check as in section 5. If it fails, treat the result as `not_mentioned` (be conservative).
- **Apply:**
  - Insert a `commitment_events` row for each result.
  - `done` sets status to done. `in_progress` sets in_progress. `changed` sets status changed and `change_note = note`.
  - `not_mentioned` counts only if the owner was present in M: then `misses += 1`, and **if `misses >= 2`, status becomes `dropped`**. Any status other than `not_mentioned` resets `misses` to 0.
  - Set `meetings.ledger_checked_at`.
- **Known limitation, to state in the README:** a meeting uploaded out of date order only checks commitments from earlier dates.

**Pre-meeting brief** (`/brief`): pick people. Show their open, changed and dropped commitments plus the last 5 decisions from meetings with them. A pure database query, **no LLM**.

**Who owes what**: grouped by owner, from the database. **No LLM.**

---

## 7. Pages

| Route | Purpose |
|---|---|
| `/` | Landing page: one-line pitch, "Try it" (anonymous sign-in), "View demo" |
| `/meetings` | Library: list plus full-text search across titles and transcripts (snippet and timestamp links) |
| `/meetings/new` | Record (mic, or Chrome-only "Meeting tab + mic") or upload. Consent step first |
| `/meetings/[id]` | Player with synced transcript, speaker mapping, TL;DR, Who owes what, commitments (kind badges, quote links, Confirm/Reject, ledger history), decisions, chapters, "N items dropped: no evidence", share |
| `/ledger` | By person; filters: open, changed, dropped, done; each row links to source and evidence moments |
| `/decisions` | Decision log across meetings |
| `/brief` | Pre-meeting brief |
| `/share/[token]` | Public, read-only, **redacted**. If the share has a person, show only that person's items |
| `/settings` | Glossary, default summary language, export all (zip), delete all |
| `/demo/...` | Read-only view of the demo owner's data (Chunk 8) |

---

## 8. Recording details (client)

- MIME type: `audio/webm;codecs=opus`, falling back to `audio/mp4`. `audioBitsPerSecond: 32000`.
- `MediaRecorder.start(5000)`. Every `dataavailable` chunk goes to IndexedDB immediately (`rec:{sessionId}:{seq}`, plus session metadata). On page load, if an unfinished session exists, show a **Recover recording** banner that rebuilds the Blob in order and uploads it. Delete local chunks only after the server confirms `uploaded`.
- **Off the record:** `pause()` and `resume()`. Store `{at_ms, paused_ms}` (`at_ms` on the audio timeline).
- **Mic meter:** `AnalyserNode` RMS. Warn if the level stays near silent for 30 s.
- **Screen Wake Lock** while recording, re-acquired on `visibilitychange`. A `beforeunload` warning while recording. Mobile banner: "Keep this screen on — phones stop web recording when locked."
- **Tab + mic (Chrome desktop only, hidden elsewhere):** `getDisplayMedia({ video: true, audio: true })`. Stop the video tracks. If there is no audio track, show "Tick 'Share tab audio' and try again". Mix the tab and mic streams through `AudioContext`, then `MediaStreamDestination`, into the recorder.
- **Upload:** `audio/*` and `video/*`, ≤ 50 MB, duration ≤ 90 min (read from media metadata).
- **Transcript gap markers:** a gap of more than 30 s between consecutive segments shows "Silence or untranscribed — listen". Off-record ranges show "Off the record (paused N min)".

---

## 9. Chunks

### Chunk 1: Scaffold, database, auth, deploy
- Ask the user the questions in section 11 if they're unanswered, and record the answers there.
- Create the Next.js app in the repo root (TypeScript, Tailwind, ESLint, App Router, `src/` dir). Init shadcn/ui. Add the scripts `typecheck` and `test`.
- Install: `@supabase/supabase-js @supabase/ssr @google/genai zod chrono-node idb-keyval fflate nanoid`, with dev dependency `vitest`.
- `src/lib/supabase/{server,browser,admin}.ts`, middleware for session refresh, and `getUserOrThrow()`.
- `.env.example`, `.gitignore` (including `.env*.local`), `supabase/migrations/0001_init.sql` (section 3).
- Landing page with "Try it" (anonymous sign-in), an app shell with nav (Meetings, Ledger, Decisions, Brief, Settings), and `/api/health`.
- `vercel.json` with a daily cron hitting `/api/health`, which checks `CRON_SECRET`.
- User steps: create the Supabase project, enable anonymous sign-ins, run the SQL, fill `.env.local`, create a GitHub repo and push, import into Vercel, add the env vars, deploy.
- **Done when:** the deployed URL loads, "Try it" signs in, and `/api/health` returns ok.

### Chunk 2: Capture (Gaps 4, 6, 7-consent, 8)
- `/meetings/new`: consent step (checkbox plus optional note, stored), title, summary language, and an optional meeting date and time (defaults to now; saved to `recorded_at`, which the ledger order depends on).
- Mic recorder with IndexedDB chunks, recovery banner, wake lock, mic meter and silence warning, off-the-record, beforeunload warning.
- Chrome "Meeting tab + mic" mode.
- File upload with size and duration checks.
- Routes `POST /api/meetings` and `/api/meetings/[id]/uploaded`, with the daily cap check.
- **Done when:** a 1-minute recording uploads. Refreshing mid-recording, then using Recover, still uploads a playable file. A file over 50 MB is rejected clearly.

### Chunk 3: Transcription (Gap 5)
- `/api/meetings/[id]/transcribe` exactly as in sections 2 and 4, with the glossary from `settings` as `keyterm`, usage tracking, status and errors.
- A processing-status UI on the meeting page with Retry. Gap-detection function plus tests.
- **Done when:** a Hinglish test clip produces segments with speaker numbers and timestamps, and the minutes are recorded in `usage_daily`.

### Chunk 4: Evidence-first extraction (Gaps 1, 3)
- `src/lib/verify.ts` (normalize, quote check, owner resolution, due dates), `src/lib/redact.ts`, and vitest tests covering: a made-up quote is dropped, the self owner, an assigned owner with and without acknowledgement, Devanagari text, "by Friday", and redaction of emails and phone numbers.
- `/api/meetings/[id]/extract` with the Gemini schema, zod validation, inserts, and `dropped_count`.
- **Done when:** the tests pass, and on a real clip every stored item's quote is found in its segment.

### Chunk 5: Meeting page
- Audio player (signed URL) with a synced transcript: highlight the current segment (binary search on `timeupdate`), click a line to jump, auto-scroll toggle. Gap and off-record markers.
- Speaker mapping panel with name-hint suggestions; saving calls `/api/meetings/[id]/speakers`.
- Panels: TL;DR, Who owes what, commitments (kind badges, quote chips that jump to the moment, Confirm/Reject), decisions, chapters, the "N items dropped" note.
- **Done when:** clicking any quote jumps to the right moment, and renaming a speaker updates the owners everywhere.

### Chunk 6: Commitment Ledger, brief, decisions (Gap 2)
- The ledger check in the speakers route (section 6) plus a "Re-check" button.
- Ledger history on each commitment ("Done in *Weekly sync, Oct 20* — 'sent the deck yesterday'").
- Pages `/ledger`, `/brief`, `/decisions`.
- **Done when:** with 2–3 connected test meetings, one item is marked done, one changed, and one dropped after 2 meetings without a mention, each with a verified quote.

### Chunk 7: Library, search, sharing, settings (Gap 7)
- `/meetings` list and full-text search (`simple` config) with snippet and timestamp links.
- Share links (whole meeting, or per person) through a redacted public page, with revoke.
- `/settings`: glossary, summary language, export all (zip of Markdown and JSON per meeting, redacted), delete all (storage files and rows).
- **Done when:** a share link opens in a private window with no emails or phone numbers visible, and the export zip opens correctly.

### Chunk 8: Demo, polish, README
- The user records the 3 demo meetings (section 12) with a friend, using their own account. Set `DEMO_OWNER_ID`. Build the read-only `/demo` views by reusing components with a `readOnly` flag.
- Loading, empty and error states everywhere; mobile check; the friendly quota messages.
- `README.md`: the pitch, a link to the live demo, what we kept from Fathom, **what we changed and why** (summarize `docs/research.md` with sources), what we cut and why, free-tier caveats (Gemini data use, the ledger's date-order limitation), setup steps, and the architecture.
- Final production deploy, plus a last pass over this checklist.
- **Done when:** a stranger can open the URL, view the demo ledger story, and try their own recording.

### Cut order if behind schedule
1. Chunk 2's tab+mic mode
2. Chunk 3's gap markers
3. Chunk 7's export zip

**Never cut** evidence verification (Chunk 4) or the ledger (Chunk 6).

---

## 10. Progress (agent updates this after each chunk)

- [x] Chunk 1: Scaffold, database, auth, deploy (user confirmed the five setup steps, including deploy, on Oct 25)
- [x] Chunk 2: Capture
- [ ] Chunk 3: Transcription
- [ ] Chunk 4: Evidence-first extraction
- [ ] Chunk 5: Meeting page
- [ ] Chunk 6: Commitment Ledger, brief, decisions
- [ ] Chunk 7: Library, search, sharing, settings
- [ ] Chunk 8: Demo, polish, README

Notes and deviations:
- Agent prompt/response capture runs automatically via Cursor hooks (`.cursor/hooks.json`) into `.agent-logs/`. Don't touch those files.
- The user commits and pushes himself; agents never run `git commit` or `git push`.
- Chunk 1: Next.js 16.4.3 renamed middleware to `src/proxy.ts`. Session refresh is there. `cacheComponents` is off because signed-in pages read cookies. `@types/node` is 24 so vitest 5 installs. Product name is Kept. User confirmed Supabase, local sign-in, health, and the Vercel deploy on Oct 25. This chat did not re-open the live URL.
- Chunk 2: Capture posts audio with a signed upload URL (plan section 8), not TUS. IndexedDB keeps the chunks until `uploaded` succeeds. The daily cap uses the UTC day in `usage_daily`, plus meetings still `uploaded` or `transcribing`. `/meetings/[id]` is only a playback stub so a finished upload can be checked; Chunk 5 replaces it with the full meeting page. Tab + mic was not cut.

---

## 11. Open questions (Chunk 1 asks these if they're still blank)

- Product name: default **Kept**. Answer: Kept (user said start Chunk 1 without picking another name)
- Comfortable with TypeScript, React, Next.js and Tailwind? Answer: proceeding; user is a software engineer and said start
- Are all accounts and keys ready (GitHub, Vercel, Supabase, Deepgram, Gemini, Groq optional)? Answer: not confirmed. Secrets stay out of chat. User does the account steps at the end of Chunk 1
- Has the official assignment brief been pasted into `docs/brief.md`? Answer: yes (Oct 24)

---

## 12. Demo meeting script (record in Chunk 8, about 5 minutes each)

People: **Himanshu** (you) and **Rahul** (your friend). Speak naturally; you don't need to read it word for word.

**Meeting 1: "Launch planning" (Oct 20, English)**
- Rahul: "I'll send the pricing deck by Friday."
- Himanshu: "I'll fix the login bug before Wednesday."
- Rahul: "Maybe we should try a referral program." *(a suggestion, not a task)*
- Decision: "Okay, we're launching on November 3rd."
- Himanshu: "Rahul, can you book the demo room?" Rahul: "Sure, I'll do it." *(assigned, then acknowledged)*

**Meeting 2: "Weekly sync" (Oct 22, Hinglish)**
- Rahul: "Pricing deck maine kal bhej diya tha." *(deck → done)*
- Himanshu: "Login bug abhi bhi chal raha hai, half fix ho gaya." *(bug → in progress)*
- Nobody mentions the demo room. *(miss 1)*
- Decision change: "Launch November 10 ko shift karte hain." *(decision changed)*

**Meeting 3: "Pre-launch check" (Oct 24, English)**
- Himanshu: "Login bug is fixed and deployed." *(→ done)*
- The demo room is still not mentioned while Rahul is present. *(miss 2 → **silently dropped**)*
- Rahul: "If the beta numbers look good, I'll email the investors." *(conditional)*

Record each meeting on its own date if possible. Otherwise, set `recorded_at` to the dates above when creating them, so the ledger order is correct.
