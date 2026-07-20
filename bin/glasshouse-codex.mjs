#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { renderSessionHtml } from "../packages/viewer/src/index.mjs";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sessionsDirectory = path.join(rootDirectory, "storage", "sessions");
const genesisHash = "GLASSHOUSE_GENESIS_V1";

function usage() {
  console.error("Usage: pnpm record:codex -- --cd /path/to/project [--model MODEL] [--html] -- \"Your Codex prompt\"");
  process.exit(1);
}

const argumentsAfterNode = process.argv.slice(2);
if (argumentsAfterNode[0] === "--") argumentsAfterNode.shift();
const separator = argumentsAfterNode.indexOf("--");
const commandArguments = separator === -1 ? [] : argumentsAfterNode.slice(separator + 1);
const options = separator === -1 ? argumentsAfterNode : argumentsAfterNode.slice(0, separator);
const directoryIndex = options.indexOf("--cd");
const projectDirectory = directoryIndex === -1 ? process.cwd() : options[directoryIndex + 1];
const modelIndex = options.indexOf("--model");
const model = modelIndex === -1 ? undefined : options[modelIndex + 1];
const emitHtml = options.includes("--html");
const prompt = commandArguments.join(" ");
if (!prompt || (directoryIndex !== -1 && !projectDirectory) || (modelIndex !== -1 && !model)) usage();

const codexExecutable = process.env.CODEX_BIN
  ?? ["/opt/homebrew/bin/codex", "/usr/local/bin/codex"].find(existsSync)
  ?? "codex";
const codexArguments = ["exec", "--json"];
if (!existsSync(path.join(projectDirectory, ".git"))) codexArguments.push("--skip-git-repo-check");
if (model) codexArguments.push("--model", model);
codexArguments.push("--cd", projectDirectory, prompt);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, canonicalize(child)]));
  return value;
}
function hash(previousHash, timestamp, payload) { return createHash("sha256").update(`${previousHash}${timestamp}${JSON.stringify(canonicalize(payload))}`).digest("hex"); }

const session = { id: randomUUID(), title: prompt.slice(0, 72), agent: "codex-cli", startedAt: new Date().toISOString(), events: [] };
let previousHash = genesisHash;
function record(type, payload, metadata = {}, duration) {
  const timestamp = new Date().toISOString();
  const current_hash = hash(previousHash, timestamp, payload);
  session.events.push({ id: randomUUID(), timestamp, type, payload, duration, metadata, previous_hash: previousHash, current_hash });
  previousHash = current_hash;
}

function textFrom(item) {
  return item.text ?? item.content ?? item.message ?? item.output ?? "";
}
function recordItem(item, phase) {
  if (!item || item.type === "reasoning") return;
  const metadata = { source: "codex-cli", itemType: item.type ?? "unknown" };
  if (item.type === "command_execution") {
    const payload = { command: item.command ?? "", cwd: item.cwd ?? projectDirectory, exitCode: item.exit_code ?? null };
    record(phase === "started" ? "COMMAND_STARTED" : "COMMAND_FINISHED", payload, metadata, item.duration_ms);
    if (phase === "completed" && item.aggregated_output) record(item.exit_code === 0 ? "STDOUT" : "STDERR", { output: item.aggregated_output, exitCode: item.exit_code ?? null }, metadata);
    return;
  }
  if (phase === "completed" && item.type === "file_change") {
    const changes = Array.isArray(item.changes) ? item.changes : [item];
    for (const change of changes) record("FILE_WRITE", { path: change.path ?? change.file_path ?? "unknown", diff: change.diff ?? change.patch ?? null, kind: change.kind ?? change.type ?? "update" }, metadata);
    return;
  }
  if (phase === "completed" && (item.type === "agent_message" || item.type === "message")) {
    const text = textFrom(item);
    if (typeof text === "string" && text) record("ASSISTANT_MESSAGE", { text }, metadata);
  }
}

function consumeEvent(event) {
  const metadata = { source: "codex-cli", eventType: event.type ?? "unknown" };
  if (event.type === "item.started") recordItem(event.item, "started");
  else if (event.type === "item.completed") recordItem(event.item, "completed");
  else if (event.type === "error") record("STDERR", { message: event.message ?? "Codex reported an error" }, metadata);
}

record("SESSION_STARTED", { projectDirectory }, { source: "glasshouse-wrapper" });
record("USER_PROMPT", { text: prompt }, { source: "glasshouse-wrapper" });
const codex = spawn(codexExecutable, codexArguments, { stdio: ["inherit", "pipe", "pipe"] });
let lineBuffer = "";
codex.stdout.on("data", (chunk) => {
  const output = chunk.toString(); process.stdout.write(output); lineBuffer += output;
  const lines = lineBuffer.split("\n"); lineBuffer = lines.pop() ?? "";
  for (const line of lines) { try { consumeEvent(JSON.parse(line)); } catch { /* Codex output remains visible but unrecorded if it is not JSON. */ } }
});
codex.stderr.on("data", (chunk) => process.stderr.write(chunk));
codex.on("error", (error) => { console.error(`Unable to start Codex at ${codexExecutable}: ${error.message}\nInstall it with: npm install -g @openai/codex\nOr set CODEX_BIN to the full executable path.`); process.exitCode = 1; });
codex.on("close", async (code) => {
  if (lineBuffer.trim()) { try { consumeEvent(JSON.parse(lineBuffer)); } catch { /* ignored */ } }
  record("SESSION_FINISHED", { exitCode: code ?? 1, outcome: code === 0 ? "success" : "failure" }, { source: "glasshouse-wrapper" });
  session.finishedAt = new Date().toISOString();
  await mkdir(sessionsDirectory, { recursive: true });
  const target = path.join(sessionsDirectory, `${session.id}.json`);
  const temporary = `${target}.tmp`;
  await writeFile(temporary, JSON.stringify(session, null, 2), { flag: "wx" });
  await rename(temporary, target);
  console.error(`\nGlasshouse recorded ${session.events.length} observable events: ${target}`);
  if (emitHtml) {
    const htmlTarget = path.join(sessionsDirectory, `${session.id}.html`);
    await writeFile(htmlTarget, await renderSessionHtml(session), { flag: "wx" });
    console.error(`Self-contained replay (open it in any browser, no server needed): ${htmlTarget}`);
  }
  process.exitCode = code ?? 1;
});
