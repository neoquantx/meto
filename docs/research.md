# Research: where Fathom falls short, and how we close each gap

Research date: Oct 19, 2026. Every claim below links to its source.

## 1. Context

- Fathom is an AI meeting notetaker for Zoom, Google Meet and Microsoft Teams. It is rated 5.0 on G2 from 7,017 reviews ([G2](https://ai.g2.com/product/fathom-video)) and has 400,000+ monthly active users ([TechCrunch](https://techcrunch.com/2026/09/14/superhuman-acquires-yc-backed-notetaker-fathom-as-productivity-platforms-push-for-agentic-work/)).
- Superhuman acquired Fathom on Sep 14, 2026 and is pushing it toward agents and follow-through work across email, docs and calendars ([Superhuman blog](https://blog.superhuman.com/superhuman-acquires-fathom/)).
- Users praise capture and summaries. The complaints cluster after the meeting: trust, follow-through, flexibility and privacy.

## 2. What Fathom already has (we must not claim these as new)

| Feature | Notes | Source |
|---|---|---|
| AI action items with assignee and completed status | Paid plans only | [Free vs Premium](https://help.fathom.video/en/articles/5290881) |
| Ask Fathom across all meetings | Paid; chat history is not saved | [Ask Fathom](https://help.fathom.video/en/articles/3239425) |
| Asana sync | Only items assigned to you, in calls you recorded | [Asana](https://help.fathom.video/en/articles/7639617) |
| Transcript editing, speaker reassignment | | [Zapier](https://zapier.com/blog/fathom-features/) |
| Custom dictionaries, Trackers, live summary | | [Fathom overview](https://www.fathom.ai/overview) |
| Bot-free capture | Mac only, beta | [Scribbl](https://scribbl.co/post/granola-vs-otter-vs-fireflies-vs-fathom) |
| iOS app for in-person meetings | No Android | [App Store](https://apps.apple.com/us/app/fathom-ai-notetaker/id6751613402), [Litmus](https://litmustools.com/review/fathom/) |

Decision: "Ask across meetings" would only match Fathom, so it is a stretch goal, not a headline.

## 3. Complaint volume (G2's own summary of reviews)

From [G2 pros and cons](https://www.g2.com/it/products/fathom-video/reviews?qs=pros-and-cons):

| Complaint | Mentions |
|---|---|
| Fathom has to join as a participant (the bot) | 415 |
| Recording problems (unwanted recordings, glitches) | 342 |
| Missing features for call handling, transcript readability | 249 |
| Call issues (auto-join, transcript trouble) | 213 |
| Auto-recordings pile up, making action items hard to manage | 212 |

## 4. The gaps: evidence, root cause, our fix

### Gap 1: Summaries are too long and nobody reads them

Evidence
- "AI overviews... span the length of 2 word docs. I either don't read it..." (90 upvotes). The format that worked was "team member + what that person needs to take care of" ([r/corporate](https://www.reddit.com/r/corporate/comments/1tl5182/im_sick_of_the_ai_meeting_overviews_that_get_sent/)).
- A project manager spends an hour fixing each AI summary; the team doesn't read them ([r/projectmanagement](https://www.reddit.com/r/projectmanagement/comments/1w0383c/please_tell_me_honestly_how_long_it_takes_you_to/)).
- "Sometimes the summary is a little more detailed than I need" ([Capterra](https://www.capterra.com/p/276054/Fathom/)).

Root causes
- One summary is written for everyone, so it has no reader in mind and gets padded.
- Long recaps look thorough, so tools and users reward length.
- Prose hides the one thing a reader needs: what do I personally have to do?

Our fix
- Structured output only, with hard limits: the TL;DR is at most 3 bullets of 25 words.
- A "Who owes what" view: one line per person. A per-person share link shows only that person's items.
- An explicit "Nothing for you in this meeting" state.
- Every bullet links to its timestamp, because a summary loses detail and the source must be one click away.

### Gap 2: Promises get lost between meetings

Evidence
- "The summary gets written, nobody reads it, the actions get lost... The extraction and tracking loop mostly is not [solved]" ([r/aiToolForBusiness](https://www.reddit.com/r/aiToolForBusiness/comments/1u7bf9s/are_meeting_summaries_solving_the_wrong_problem/)).
- "What matters is whether anything got dropped between meeting 12 and meeting 40." Also: "what has changed since we decided it?" ([r/AiNoteTaker](https://www.reddit.com/r/AiNoteTaker/comments/1wtaztu/at_what_point_did_we_start_needing_an_ai_tool_for/)).
- In Fathom, an item's status changes only by a manual tick or an Asana sync ([Asana](https://help.fathom.video/en/articles/7639617)).

Root causes
- Each meeting is processed on its own. Action items are text, not tracked objects with an ID and a history.
- People have no identity across meetings: "Speaker 1" in meeting A is not linked to "Speaker 1" in meeting B.
- Updating a status needs a human, and nobody does it.
- Silence is not treated as a signal. A task never mentioned again just disappears.

Our fix: the Commitment Ledger
- Data model: `people` (workspace level), `meeting_speakers` (speaker label mapped to a person), `commitments` (owner, text, due date, status, source quote and timestamp), `commitment_events` (one per later meeting: status plus proof).
- After each meeting, the user maps speakers to people once. The AI suggests names from introductions ("Hi, I'm Rahul").
- When meeting N is processed, the open commitments of its participants are sent with the transcript. The AI returns a status for each, `done`, `in_progress`, `changed` or `not_mentioned`, with a verbatim quote that is then checked.
- A commitment `not_mentioned` in 2 meetings where its owner was present is flagged "silently dropped".
- Pre-meeting brief: choose the people, and get open items, dropped items and recent decisions.

Honest note: decision logs across meetings exist in smaller tools ([Acta](https://acta.ai/answers/meeting-decision-log), [Groundnote](https://groundnote.com.au/decision-tracking.html)). Our difference compared to Fathom is automatic status checks plus mandatory proof.

### Gap 3: People can't trust AI action items

Evidence
- A test of 6 tools, including Fathom, across 73 meetings: all of them missed implied and conditional tasks and created "phantom action items" ([Mursa](https://www.mursa.me/blog/ai-note-taker-meeting-action-items)).
- "A confidently wrong owner costs you more than an unassigned line would" ([r/AiNoteTaker](https://www.reddit.com/r/AiNoteTaker/comments/1wtaztu/at_what_point_did_we_start_needing_an_ai_tool_for/)).
- G2 cons: "occasional inaccuracies in action items" ([G2](https://ai.g2.com/product/fathom-video)). Capterra: errors "in the attributions to who was speaking" ([Capterra p.11](https://www.capterra.com/p/276054/Fathom/reviews/?page=11)).
- Category-wide: invented decisions and misattributed quotes ([Coommit](https://coommit.com/blog/ai-meeting-summary-hallucinations-2026)).

Root causes
- Ask a model to "list action items" and it will always produce some, even when nothing was committed.
- The model guesses the owner from text, so "we" language and speaker-label mistakes produce wrong owners.
- Hedges ("we should", "maybe") and conditions ("if the data looks good") read like commitments.
- There's no link to proof. Checking an item means rewatching the meeting, so users stop trusting the whole section.

Our fix: evidence-first extraction
- The output schema requires `quote` (verbatim) and `segment_id`. An empty list is a valid answer.
- The server checks the quote against the cited segment and its neighbors, using normalized fuzzy matching. If the quote isn't there, the item is dropped. The UI shows "N items dropped: no evidence found".
- The owner comes from data, not from the model's guess:
  - First person ("I'll send it"): the owner is the speaker of that segment.
  - Assigned to someone ("Rahul, can you..."): that person is the owner only if they acknowledge it in a following segment, which is also checked. Otherwise the item is "Unassigned — claim it".
- Types: `explicit`, `conditional` (the condition is kept) and `suggestion`. Suggestions appear as ideas, not tasks.
- Due dates only when spoken. Relative dates ("by Friday") are resolved in code against the meeting date.
- Confirm/Reject on every item.

### Gap 4: No file upload, weak in-person capture, no Android

Evidence
- Fathom FAQ: "Fathom can only record and transcribe live meetings on Zoom, Google Meet, and Microsoft Teams — we do not support uploaded calls" ([Fathom FAQ](https://help.fathom.video/en/categories/72000)).
- No Android app; weak in-person capture ([Litmus](https://litmustools.com/review/fathom/)).

Root cause
- Capture is tied to meeting platforms (a bot, or a desktop app that hooks into Zoom/Meet/Teams) and to calendar events. Files have no way in, and every platform needs its own native app.

Our fix
- One pipeline for every input. Any audio goes to storage, then the same transcription and extraction.
- Inputs: the browser microphone (Android Chrome, iOS Safari 14.5+ via [MediaRecorder](https://caniuse.com/mdn-api_mediarecorder_resume)) and file upload (audio or video).

Limits we design around
- A web page cannot record while the phone screen is locked; this is an OS limit ([GPSTrack](https://gpstrack.dev/blog/why-your-run-stops-recording-when-the-screen-locks)). Mitigation: [Screen Wake Lock](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API), re-acquired on `visibilitychange`, plus a clear "keep this screen on" banner.
- The Supabase free plan caps uploads at 50 MB ([Supabase limits](https://supabase.com/docs/guides/storage/uploads/file-limits)). We record in Opus at about 32 kbps, roughly 14 MB per hour. Larger uploads are rejected with a clear message; extracting audio from video in the browser is a stretch goal.

### Gap 5: Hinglish (Hindi and English mixed together)

Evidence
- Fathom lists Hindi among 38 languages, but translated summaries cover only 6 European languages ([Fathom languages](https://help.fathom.video/en/articles/296192)). Its mixed-language behavior is not documented ([anarlog](https://anarlog.so/blog/best-multilingual-ai-notetaker/), [noterai](https://www.noterai.net/best/hindi-meeting-transcription-app)).

Root causes
- Most speech-to-text systems detect one language per file, so the other language gets transcribed phonetically.
- Script ambiguity: Devanagari or Roman script.
- Downstream features are English-first. Deepgram's entity redaction, for example, is English-only ([Deepgram redaction](https://developers.deepgram.com/docs/redaction)).

Our fix
- Deepgram `nova-3` with `language=multi`, which supports Hindi-English switching within a sentence ([Deepgram code-switching](https://developers.deepgram.com/docs/multilingual-code-switching.mdx), [Feb 2026 update](https://deepgram.com/learn/nova-3-multilingual-major-wer-improvements-across-languages)).
- A summary language picker: English, Hindi or Hinglish.
- A workspace glossary of names and jargon, passed as Deepgram `keyterm` (Nova-3 only). This targets the "names and specific terms" complaints.
- Our own regex redaction, because entity redaction is English-only.
- Stretch: a romanized view of Devanagari segments.

### Gap 6: Recording failures and holes in transcripts

Evidence
- 342 mentions of recording problems and 213 of call or auto-join issues ([G2](https://www.g2.com/it/products/fathom-video/reviews?qs=pros-and-cons)).
- "Large gaps in my transcriptions (up to 2-3 min)... Support couldn't explain this" ([Reddit](https://www.reddit.com/r/buhaydigital/comments/1bcatxr/fathom_ai_vs_fireflies_ai_vs_otter_ai/)).
- Fathom's own setup advice asks users to turn off Zoom waiting rooms and avoid personal meeting IDs ([r/Zoom](https://www.reddit.com/r/Zoom/comments/1m83h7w/fathom_ai_cant_join_my_meetings/)).

Root causes
- The bot depends on third-party meeting settings it doesn't control.
- A single upload at the end means a crash, tab close, network drop or laptop sleep loses everything.
- Silent failures: a muted or wrong microphone goes unnoticed until afterwards.
- Gaps in a transcript aren't shown, so users find them later.

Our fix
- `MediaRecorder` with a 5-second timeslice. Every chunk is saved to IndexedDB immediately. After a reload, a "Recover unfinished recording" banner appears.
- Resumable upload via TUS, which Supabase supports ([resumable uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads)). The local copy is kept until the server confirms.
- A live mic level meter, a "no audio for 30 seconds" warning, and a warning before closing the page.
- After transcription, stretches longer than 30 seconds with no words are marked "silence or untranscribed — listen" in the transcript.

### Gap 7: Privacy, consent and owning your data

Evidence
- The privacy suit against Otter is going ahead in court; Fireflies and Granola face similar suits about recording without consent, voiceprints and training ([Computerworld](https://www.computerworld.com/article/4219742/ai-notetakers-at-work-could-leave-companies-at-risk-for-lawsuits.html), [Bloomberg Law](https://news.bloomberglaw.com/litigation/otter-ai-stuck-with-privacy-lawsuit-over-meeting-transcriptions)).
- Fathom uses de-identified customer data to improve its models unless you opt out ([Scribbl](https://scribbl.co/post/granola-vs-otter-vs-fireflies-vs-fathom)).
- Trustpilot: users describe losing access to years of recordings after an email change, and having no bulk download ([Trustpilot AU](https://au.trustpilot.com/review/fathom.video), [Trustpilot CA](https://ca.trustpilot.com/review/fathom.video?page=9)).

Root causes
- Business incentive: meeting data is valuable training data, so the defaults favor collection.
- Consent rests on the host alone; other participants are informed at best, never asked.
- Recording is all or nothing; there's no "this part is off the record".
- Lock-in: no self-serve bulk export, and accounts are tied to one email.

Our fix
- A consent step before recording, stored with the meeting along with an optional consent line to read aloud.
- "Off the record" is a true pause: nothing is captured, and a marker shows the gap.
- Phone numbers and emails are redacted (regex for all languages, plus Deepgram `redact=pii` for English). Share links always show the redacted view.
- Deepgram `mip_opt_out=true`, which opts out of Deepgram's model-improvement program. It costs more per minute and is paid from the free credit.
- One-click export (JSON and Markdown per meeting) and true deletion (storage object and database rows).
- Stretch: retention settings (delete audio after N days, keep the text).

Honest note: Gemini's free tier may use submitted data to improve Google products ([Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)). The demo uses non-sensitive audio; a production version would move to paid, no-training tiers.

### Gap 8: The visible bot (top complaint by volume)

Evidence
- 415 G2 mentions, the most common complaint ([G2](https://www.g2.com/it/products/fathom-video/reviews?qs=pros-and-cons)). Bot-free capture is Mac-only and in beta; Windows still gets the bot ([Litmus](https://litmustools.com/review/fathom/), [Scribbl](https://scribbl.co/post/granola-vs-otter-vs-fireflies-vs-fathom)).

Root cause
- A bot is the easiest cross-platform way to get every speaker's audio without installing software.

Our fix
- No bot at all. For browser meetings in desktop Chrome (Meet, Teams web, Zoom web), the user shares the meeting tab with "Share tab audio" ticked (`getDisplayMedia`). The tab audio is mixed with the microphone using the Web Audio API and recorded. This works on Windows and Mac without installing anything.
- The consent step from Gap 7 still applies. No bot does not mean no consent.

## 5. Free-tier limits that shape the design

| Service | Limit | Design response |
|---|---|---|
| Vercel Hobby | 300 s maximum function duration; non-commercial use ([Vercel](https://vercel.com/docs/functions/limitations)) | Synchronous Deepgram calls using a signed URL (fast for meetings up to an hour); split processing into steps |
| Supabase Free | 50 MB per file, 1 GB storage, 500 MB database; project pauses after 7 days of inactivity ([pricing](https://supabase.com/pricing), [pausing](https://supabase.com/docs/guides/platform/free-project-pausing)) | Opus audio; a daily Vercel cron ping so the app is still up when reviewers open it later |
| Deepgram | $200 free credit, no card, no expiry ([pricing](https://deepgram.com/pricing)) | Primary transcription with speaker labels |
| Groq | Whisper free, 25 MB per file, about 8 h of audio per day, no speaker labels ([Groq](https://console.groq.com/docs/rate-limits)) | Fallback only |
| Gemini Flash | Free tier; data may be used to improve products ([Gemini](https://ai.google.dev/gemini-api/docs/pricing)) | Extraction and ledger checks; demo with non-sensitive audio |

## 6. Deliberately cut

- The meeting bot: it's the top complaint, and it needs a paid service such as Recall.ai.
- CRM sync, scorecards, coaching: enterprise sales features that don't help an individual.
- Talk-time and sentiment stats: users find them "interesting for about a day" ([r/AiNoteTaker](https://www.reddit.com/r/AiNoteTaker/comments/1wtaztu/at_what_point_did_we_start_needing_an_ai_tool_for/)).
- A live scrolling transcript: "reading it competes with listening" (same thread).
