const fs = require("node:fs");
const path = require("node:path");

const event = process.argv[2];
const root = path.resolve(__dirname, "../..");
const logsDir = path.join(root, ".agent-logs");
const stateDir = path.join(__dirname, ".state");
const config = readJson(path.join(__dirname, "capture.config.json")) || {};
const payload = readStdinJson();
const timestamp = new Date().toISOString();
const sessionId = String(
  payload.sessionId || payload.session_id || payload.conversationId || payload.conversation_id || "unknown-session",
);
const model = String(payload.model || payload.modelId || payload.model_id || process.env.COPILOT_MODEL || "unknown");

try {
  fs.mkdirSync(logsDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  const statePath = path.join(stateDir, `${safeName(sessionId)}.json`);
  const state = readJson(statePath) || {
    file: null,
    exchanges: 0,
    models: [],
    firstPromptTime: null,
    lastPromptTime: null,
    pendingResponse: null,
  };

  if (event === "prompt") {
    flushPending(state);
    const prompt = textFrom(payload.prompt ?? payload.userPrompt ?? payload.message ?? "");
    writePrompt(state, prompt, timestamp, model);
  } else if (event === "response") {
    const response = responseText(payload);
    if (response) {
      state.pendingResponse = { text: response, timestamp, model };
    } else {
      state.pendingResponse = {
        text: "[response not captured: agentStop provided no response text or readable transcript]",
        timestamp,
        model,
        source: "missing",
      };
    }
    flushPending(state);
  }

  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
} catch (error) {
  fs.appendFileSync(
    path.join(stateDir, "errors.log"),
    `${timestamp} ${error instanceof Error ? error.stack : String(error)}\n`,
  );
}

process.stdout.write("{}");

function writePrompt(state, text, timestamp, entryModel) {
  ensureLogFile(state, timestamp);
  state.exchanges += 1;
  state.firstPromptTime ||= timestamp;
  state.lastPromptTime = timestamp;
  addModel(state, entryModel);
  appendEntry(state, "PROMPT", state.exchanges, timestamp, entryModel, text);
}

function flushPending(state) {
  if (!state.pendingResponse) return;
  ensureLogFile(state, state.pendingResponse.timestamp);
  const entry = state.pendingResponse;
  appendEntry(
    state,
    "RESPONSE",
    state.exchanges,
    entry.timestamp,
    entry.model,
    entry.text,
    entry.source ? { source: entry.source } : {},
  );
  state.pendingResponse = null;
}

function ensureLogFile(state, timestamp) {
  if (state.file && fs.existsSync(path.join(logsDir, state.file))) return;
  const stamp = timestamp.slice(0, 19).replace("T", "_").replace(/:/g, "-");
  state.file = `${stamp}_${sessionId}.md`;
  const date = timestamp.slice(0, 10);
  fs.writeFileSync(path.join(logsDir, state.file), frontmatter(state, date) + "\n");
}

function frontmatter(state, date) {
  return [
    "---",
    `session_id: ${sessionId}`,
    `date: ${date}`,
    `author: ${config.author || "unknown"}`,
    `model: ${state.models.join(", ") || model}`,
    `tool: ${config.tool || "vscode-copilot"}`,
    `project: ${config.project || path.basename(root)}`,
    `total_exchanges: ${state.exchanges}`,
    `first_prompt_time: ${state.firstPromptTime || ""}`,
    `last_prompt_time: ${state.lastPromptTime || ""}`,
    "---",
    "",
    `# Session Log - ${date}`,
    "",
    `Session: \`${sessionId.slice(0, 8)}\` | Project: \`${config.project || path.basename(root)}\` | Author: \`${config.author || "unknown"}\``,
    "",
    "---",
    "",
  ].join("\n");
}

function appendEntry(state, type, number, timestamp, entryModel, text, metadata = {}) {
  const file = path.join(logsDir, state.file);
  const existing = fs.readFileSync(file, "utf8");
  const body = existing.replace(/^---\n[\s\S]*?\n---\n/, "");
  const extra = Object.entries(metadata).map(([key, value]) => `${key}: ${value}\n`).join("");
  const entry =
    `[LOG_ENTRY type=${type} num=${number} session=${sessionId.slice(0, 8)}]\n` +
    `timestamp: ${timestamp}\n` +
    `model: ${entryModel}\n` +
    extra +
    `\n${text}\n\n\n`;
  fs.writeFileSync(file, frontmatter(state, existing.match(/^date: (.*)$/m)?.[1] || timestamp.slice(0, 10)) + body + entry);
}

function responseText(payload) {
  const direct = [
    payload.response,
    payload.finalResponse,
    payload.final_response,
    payload.assistantResponse,
    payload.assistant_response,
    payload.message,
    payload.text,
  ].map(textFrom).find(Boolean);
  if (direct) return direct;
  const transcriptPath = payload.transcriptPath || payload.transcript_path;
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return "";
  const rows = fs.readFileSync(transcriptPath, "utf8").split("\n").filter(Boolean);
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = readJsonValue(rows[index]);
    if (!row || !["assistant", "model"].includes(row.role)) continue;
    const text = textFrom(row.content ?? row.message ?? row.text);
    if (text) return text;
  }
  return "";
}

function textFrom(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  if (typeof value.text === "string") return value.text;
  if (typeof value.content === "string") return value.content;
  if (Array.isArray(value.content)) {
    return value.content.map(textFrom).filter(Boolean).join("\n");
  }
  return "";
}

function addModel(state, entryModel) {
  if (entryModel && !state.models.includes(entryModel)) state.models.push(entryModel);
}

function readStdinJson() {
  try {
    return JSON.parse(fs.readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function readJsonValue(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function safeName(value) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}
