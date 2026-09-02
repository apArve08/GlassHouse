#!/usr/bin/env node

// Invoked by Claude Code's own hooks (see docs/claude-code-hooks.md), once per
// PreToolUse/PostToolUse/SessionStart/UserPromptSubmit/Stop event, with the
// event JSON on stdin. Never blocks or denies the tool call it observes: any
// failure here is swallowed and the process exits 0.

import { randomUUID, createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sessionsDirectory = path.join(rootDirectory, "storage", "sessions");
const genesisHash = "GLASSHOUSE_GENESIS_V1";

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, canonicalize(child)]));
  return value;
}
function hash(previousHash, timestamp, payload) {
  return createHash("sha256").update(`${previousHash}${timestamp}${JSON.stringify(canonicalize(payload))}`).digest("hex");
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function filePathFrom(input) {
  return input.file_path ?? input.notebook_path ?? "unknown";
}

const FILE_READ_TOOLS = new Set(["Read"]);
const FILE_WRITE_TOOLS = new Set(["Write", "Edit", "NotebookEdit"]);

function normalize(event) {
  const metadata = { source: "claude-code", hookEvent: event.hook_event_name };
  const toolInput = asObject(event.tool_input);

  switch (event.hook_event_name) {
    case "SessionStart":
      return [{ type: "SESSION_STARTED", payload: { cwd: event.cwd ?? "", source: event.source ?? "startup" }, metadata }];
    case "UserPromptSubmit":
      return event.prompt ? [{ type: "USER_PROMPT", payload: { text: event.prompt }, metadata }] : [];
    case "PreToolUse":
      if (event.tool_name === "Bash") {
        return [{ type: "COMMAND_STARTED", payload: { command: toolInput.command ?? "", cwd: event.cwd ?? "" }, metadata: { ...metadata, toolName: event.tool_name } }];
      }
      return [];
    case "PostToolUse": {
      const toolName = event.tool_name ?? "unknown";
      const response = asObject(event.tool_response);
      if (toolName === "Bash") {
        const events = [{ type: "COMMAND_FINISHED", payload: { command: toolInput.command ?? "", cwd: event.cwd ?? "" }, metadata: { ...metadata, toolName } }];
        if (response.stdout) events.push({ type: "STDOUT", payload: { output: response.stdout }, metadata: { ...metadata, toolName } });
        if (response.stderr) events.push({ type: "STDERR", payload: { output: response.stderr }, metadata: { ...metadata, toolName } });
        return events;
      }
      if (FILE_READ_TOOLS.has(toolName)) {
        return [{ type: "FILE_READ", payload: { path: filePathFrom(toolInput) }, metadata: { ...metadata, toolName } }];
      }
      if (FILE_WRITE_TOOLS.has(toolName)) {
        return [{
          type: "FILE_WRITE",
          payload: { path: filePathFrom(toolInput), content: toolInput.content ?? toolInput.new_source ?? null, oldString: toolInput.old_string ?? null, newString: toolInput.new_string ?? null },
          metadata: { ...metadata, toolName }
        }];
      }
      return [];
    }
    case "Stop":
      return [{ type: "SESSION_FINISHED", payload: { outcome: "success" }, metadata }];
    default:
      return [];
  }
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

// Claude Code can fire PreToolUse/PostToolUse for parallel tool calls in the
// same session, so concurrent invocations of this script may race on the same
// session file. A simple exclusive-create lock (with a stale-lock timeout in
// case a prior invocation crashed) keeps the hash chain from corrupting.
async function withLock(lockPath, run) {
  const staleAfterMs = 5000;
  const deadline = Date.now() + 10000;
  for (;;) {
    try {
      await writeFile(lockPath, String(process.pid), { flag: "wx" });
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const age = Date.now() - (await stat(lockPath).catch(() => ({ mtimeMs: Date.now() }))).mtimeMs;
      if (age > staleAfterMs) { await rm(lockPath, { force: true }); continue; }
      if (Date.now() > deadline) throw new Error(`Timed out waiting for lock ${lockPath}`);
      await new Promise((resolve) => setTimeout(resolve, 25 + Math.random() * 50));
    }
  }
  try { return await run(); } finally { await rm(lockPath, { force: true }); }
}

async function main() {
  const raw = await readStdin();
  const hookEvent = JSON.parse(raw);
  if (!hookEvent.session_id) return;

  const normalized = normalize(hookEvent);
  if (normalized.length === 0) return;

  await mkdir(sessionsDirectory, { recursive: true });
  const target = path.join(sessionsDirectory, `${hookEvent.session_id}.json`);
  const lockPath = `${target}.lock`;

  await withLock(lockPath, async () => {
    const session = existsSync(target)
      ? JSON.parse(await readFile(target, "utf8"))
      : { id: hookEvent.session_id, agent: "claude-code", title: hookEvent.cwd ? path.basename(hookEvent.cwd) : "Claude Code session", startedAt: new Date().toISOString(), events: [] };

    let previousHash = session.events.at(-1)?.current_hash ?? genesisHash;
    for (const item of normalized) {
      const timestamp = new Date().toISOString();
      const current_hash = hash(previousHash, timestamp, item.payload);
      session.events.push({ id: randomUUID(), timestamp, type: item.type, payload: item.payload, duration: item.duration, metadata: item.metadata, previous_hash: previousHash, current_hash });
      previousHash = current_hash;
    }
    if (hookEvent.hook_event_name === "Stop") session.finishedAt = new Date().toISOString();

    const temporary = `${target}.tmp-${process.pid}`;
    await writeFile(temporary, JSON.stringify(session, null, 2));
    await rename(temporary, target);
  });
}

main().catch(() => { /* never block or fail the agent's tool call on a recorder bug */ }).finally(() => process.exit(0));
