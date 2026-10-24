# Capture test

## Tool and model

- **Tool:** Cursor 3.27.12, Agent mode.
- **Model:** One model plans and executes; there is no separate planner. Setup turns were on Cursor Auto, and the hook payload reported that only as `default`. From the session 1 canary onward the selected model is `grok-4.7`, recorded on each entry. A mid-build switch shows up the same way.

## Mechanism

Cursor's native agent hooks ([docs](https://cursor.com/docs/agent/hooks)), configured at project level so every chat in this workspace is captured, not just the one that created it.

- `.cursor/hooks.json` (config file changed): wires three events to `.cursor/hooks/capture.sh`
  - `beforeSubmitPrompt` → writes the PROMPT entry from the payload's verbatim `prompt` field
  - `afterAgentResponse` → buffers the assistant text; it fires per assistant message, so only the last message of the turn is kept (intermediate progress notes are dropped)
  - `stop` → writes the buffered text as the RESPONSE entry
- `.cursor/hooks/capture.sh`: locates `node`, runs the script, always returns `{"continue": true}` so capture can never block a prompt.
- `.cursor/hooks/capture.mjs`: writes `.agent-logs/YYYY-MM-DD_HH-MM-SS_<conversation_id>.md` in the required format, updating the front-matter counters on each entry. Entries are append-only.
- `.cursor/hooks/capture.config.json`: author / tool / project for the header.
- Fallback: if `beforeSubmitPrompt` didn't fire for a turn, `stop` recovers the prompt from Cursor's transcript file (`transcript_path`) and tags the entry `source: transcript`; with no transcript it writes an explicit `source: missing` placeholder rather than skipping the turn.
- `.gitignore` excludes only the hook's scratch state (`.cursor/hooks/.state/`). `.agent-logs/` is committed.

## Log files the canaries landed in

- Session 1 (the chat that installed the hook): `.agent-logs/2026-10-24_17-51-05_a65787c3-e5f7-45ad-9aa3-584c08f9c7ac.md`
- Session 2 (a fresh chat): `.agent-logs/2026-10-24_17-54-08_cf041373-935d-4633-84aa-15acf969d625.md`

## Canary entries (raw)

### Session 1

````
[LOG_ENTRY type=PROMPT num=4 session=a65787c3]
timestamp: 2026-10-24T17:56:26.060Z
model: grok-4.7

CAPTURE TEST — 8x assignment, Himanshu


[LOG_ENTRY type=RESPONSE num=4 session=a65787c3]
timestamp: 2026-10-24T17:56:33.104Z
model: grok-4.7

The canary is received. This reply is the response that should land next to it in `.agent-logs/2026-10-24_17-51-05_a65787c3-e5f7-45ad-9aa3-584c08f9c7ac.md`.

It is not in the log yet, because the response hook runs only after this turn ends. Send any short follow-up, for example "fill in canary 1", and I will paste both entries into `CAPTURE-TEST.md` exactly as logged.
````

### Session 2

````
[LOG_ENTRY type=PROMPT num=1 session=cf041373]
timestamp: 2026-10-24T17:54:08.913Z
model: default

CAPTURE TEST — 8x assignment, Himanshu


[LOG_ENTRY type=RESPONSE num=1 session=cf041373]
timestamp: 2026-10-24T17:54:24.001Z
model: default

The prompt capture is working. Your message was written to `.agent-logs/2026-10-24_17-54-08_cf041373-935d-4633-84aa-15acf969d625.md` as entry number 1, with the right session ID, timestamp and text. The hook error log at `.cursor/hooks/.state/errors.log` is empty.

```17:23:.agent-logs/2026-10-24_17-54-08_cf041373-935d-4633-84aa-15acf969d625.md

---

[LOG_ENTRY type=PROMPT num=1 session=cf041373]
timestamp: 2026-10-24T17:54:08.913Z
model: default

CAPTURE TEST — 8x assignment, Himanshu
```

The `afterAgentResponse` and `stop` hooks haven't run yet, because they only fire after this reply finishes. To check them, open that log file again: it should now have a response entry containing this message, and `.cursor/hooks/.state/last-payload-response.json` should be updated.

Two small things you might want to look at:
- The front matter says `author: neoquantx`, not Himanshu. If the assignment expects your name, check how `capture.mjs` / `capture.config.json` set the author.
- `model: default` is recorded instead of the actual model name. Cursor's hook payload probably only reports "default" when Auto is selected, so the script may not be able to fix this.
````

The session 2 agent's reply in the chat UI also contained intermediate progress notes ("I'll take a quick look at the workspace…"); they are correctly absent from the log, which confirms only the final response is captured.

## What didn't work first, and known quirks

- **Rules file instead of hooks:** considered and rejected. Cursor rules only add instructions to the model's context; they can't run a command, so capture would depend on the model remembering to log. Hooks fire on their own.
- **`chmod` blocked:** the agent's sandbox refused `chmod +x` on the hook script; re-ran it with full permissions.
- **First dry run failed:** simulated payloads piped through zsh `echo` had `\n` expanded into real newlines, producing invalid JSON. That was a test bug, not a hook bug, but it exposed that a missed prompt left an orphan `RESPONSE num=0`, so the placeholder/transcript fallback was added. Dry runs wrote to `/tmp`, never to `.agent-logs/`.
- **Setup prompt captured via fallback:** the hook didn't exist yet when the setup prompt was sent, so session 1's entry 1 was recovered from the transcript at the end of that turn (`source: transcript`). Its timestamp is the moment of recovery, which is why PROMPT 1 (`17:51:05.349Z`) is a fraction of a second later than RESPONSE 1 (`17:51:05.187Z`). Left as recorded.
- **Model shows `default` on Auto:** Cursor's Auto mode doesn't expose the routed model to hooks. Once an explicit model is selected, the payload includes it. Session 1's canary is `grok-4.7`.
- **Not captured by design:** answers given through clickable multiple-choice question cards don't pass through `beforeSubmitPrompt`, so the agent asks questions in plain text instead.
