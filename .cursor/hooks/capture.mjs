// Cursor hook: appends each turn's prompt and final response to .agent-logs/.
//   prompt   (beforeSubmitPrompt) -> writes the PROMPT entry immediately
//   response (afterAgentResponse) -> buffers the text; fires per assistant message,
//                                    so only the last one of the turn survives
//   stop     (stop)               -> writes the buffered text as the RESPONSE entry
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const hooksDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(hooksDir, "..", "..");
const logsDir = process.env.AGENT_LOG_DIR || path.join(repoRoot, ".agent-logs");
const stateDir = process.env.AGENT_LOG_STATE_DIR || path.join(hooksDir, ".state");
const config = readJson(path.join(hooksDir, "capture.config.json")) || {};

const event = process.argv[2];
const payload = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
const now = new Date().toISOString();
const sessionId = payload.conversation_id || payload.session_id || "unknown-session";
const shortId = sessionId.slice(0, 8);
const model = payload.model_id || payload.model || "unknown";

fs.mkdirSync(stateDir, { recursive: true });
fs.mkdirSync(logsDir, { recursive: true });
fs.writeFileSync(path.join(stateDir, `last-payload-${event}.json`), JSON.stringify(payload, null, 2));

const statePath = path.join(stateDir, `${sessionId}.json`);
withLock(statePath + ".lock", () => {
  const state = readJson(statePath) || {
    file: null,
    exchanges: 0,
    models: [],
    first_prompt_time: null,
    last_prompt_time: null,
    open_generation: null,
    pending: null,
  };

  if (event === "prompt") {
    flushPending(state);
    writePrompt(state, payload.prompt ?? "", now, model, payload.generation_id, null);
  } else if (event === "response") {
    state.pending = { text: payload.text ?? "", timestamp: now, model, generation_id: payload.generation_id };
  } else if (event === "stop") {
    if (!state.open_generation) {
      const backfill = lastTranscriptText(payload.transcript_path, "user");
      if (backfill != null) writePrompt(state, extractUserQuery(backfill), now, model, payload.generation_id, "transcript");
      else writePrompt(state, "[prompt not captured: beforeSubmitPrompt did not fire and no transcript was available]", now, model, payload.generation_id, "missing");
    }
    if (!state.pending) {
      const text = lastTranscriptText(payload.transcript_path, "assistant");
      if (text != null) state.pending = { text, timestamp: now, model, generation_id: payload.generation_id, source: "transcript" };
    }
    if (state.pending) state.pending.status = payload.status;
    flushPending(state);
  }

  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
});

function writePrompt(state, text, timestamp, model, generationId, source) {
  ensureLogFile(state, timestamp);
  state.exchanges += 1;
  state.first_prompt_time ||= timestamp;
  state.last_prompt_time = timestamp;
  if (!state.models.includes(model)) state.models.push(model);
  state.open_generation = generationId || "open";
  appendEntry(state, "PROMPT", state.exchanges, timestamp, model, text, source ? { source } : {});
}

function flushPending(state) {
  const p = state.pending;
  if (!p) return;
  ensureLogFile(state, p.timestamp);
  const extra = {};
  if (p.status && p.status !== "completed") extra.status = p.status;
  if (p.source) extra.source = p.source;
  appendEntry(state, "RESPONSE", state.exchanges, p.timestamp, p.model, p.text, extra);
  state.pending = null;
  state.open_generation = null;
}

function ensureLogFile(state, timestamp) {
  if (state.file && fs.existsSync(path.join(logsDir, state.file))) return;
  const stamp = timestamp.slice(0, 19).replace("T", "_").replace(/:/g, "-");
  state.file = `${stamp}_${sessionId}.md`;
  const date = timestamp.slice(0, 10);
  const header =
    `# Session Log - ${date}\n\n` +
    `Session: \`${shortId}\` | Project: \`${config.project}\` | Author: \`${config.author}\`\n\n---\n\n`;
  fs.writeFileSync(path.join(logsDir, state.file), frontmatter(state, date) + "\n" + header);
}

function frontmatter(state, date) {
  return [
    "---",
    `session_id: ${sessionId}`,
    `date: ${date}`,
    `author: ${config.author}`,
    `model: ${state.models.join(", ") || model}`,
    `tool: ${config.tool}`,
    `project: ${config.project}`,
    `total_exchanges: ${state.exchanges}`,
    `first_prompt_time: ${state.first_prompt_time ?? ""}`,
    `last_prompt_time: ${state.last_prompt_time ?? ""}`,
    "---",
    "",
  ].join("\n");
}

function appendEntry(state, type, num, timestamp, entryModel, text, extra) {
  const file = path.join(logsDir, state.file);
  const existing = fs.readFileSync(file, "utf8");
  const date = existing.match(/^date: (.*)$/m)?.[1] ?? timestamp.slice(0, 10);
  const body = existing.replace(/^---\n[\s\S]*?\n---\n/, "");
  const meta = Object.entries(extra).map(([k, v]) => `${k}: ${v}\n`).join("");
  const entry =
    `[LOG_ENTRY type=${type} num=${num} session=${shortId}]\n` +
    `timestamp: ${timestamp}\n` +
    `model: ${entryModel}\n` +
    meta +
    `\n${text}\n\n\n`;
  fs.writeFileSync(file, frontmatter(state, date) + body + entry);
}

function lastTranscriptText(transcriptPath, role) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;
  const lines = fs.readFileSync(transcriptPath, "utf8").split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    let row;
    try { row = JSON.parse(lines[i]); } catch { continue; }
    if (row.role !== role) continue;
    const parts = (row.message?.content ?? []).filter((c) => c.type === "text").map((c) => c.text);
    if (parts.length) return parts.join("\n");
    if (role === "user") return null;
  }
  return null;
}

function extractUserQuery(text) {
  const m = text.match(/<user_query>\n?([\s\S]*?)\n?<\/user_query>/);
  return m ? m[1] : text;
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
}

function withLock(lockPath, fn) {
  const deadline = Date.now() + 5000;
  while (true) {
    try { fs.mkdirSync(lockPath); break; } catch {
      if (Date.now() > deadline) { fs.rmSync(lockPath, { recursive: true, force: true }); continue; }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  try { fn(); } finally { fs.rmSync(lockPath, { recursive: true, force: true }); }
}
