# Glasshouse-lite

**Flight recorder for coding AI agents.** Glasshouse records observable agent activity, cryptographically links every event, and replays a session with a visual inspector. It never stores or attempts to infer hidden reasoning.

## Why it exists

When an agent reads a file, edits code, runs a command, or emits output, those are observable operational events. Glasshouse turns that event stream into an immutable, inspectable session timeline — a black box for AI coding work.

## Quick start

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`, then use **Load demo session**. Select timeline events to inspect payloads, diffs, metadata, and their cryptographic links. Press **Tamper session** to mutate a `FILE_WRITE` payload: its chain verification immediately turns red and the corrupted event is highlighted.

## Repository layout

```text
apps/web             Next.js replay dashboard
packages/core        Event, session, and adapter contracts
packages/hash        Canonical SHA-256 chain + verification
packages/sdk         Small recording API for agent integrations
packages/replay      Time-to-event replay helpers
packages/ui          Future shared UI primitives
storage              Persistence contract notes
```

## SDK

```ts
import { glasshouse } from "@glasshouse/sdk";

await glasshouse.startSession("codex-cli");
await glasshouse.record({
  type: "FILE_WRITE",
  payload: { path: "src/auth.ts", before: "...", after: "..." }
});
await glasshouse.finish();
const integrity = await glasshouse.verify();
const archive = glasshouse.export();
```

## Codex-first recording

Run a real non-interactive Codex session through the recorder:

```bash
pnpm record:codex -- --cd /path/to/your/project -- "Fix the failing validation test"
```

If your terminal says it cannot find Codex, install it with `npm install -g @openai/codex`. If it is installed in a nonstandard location, point Glasshouse to it explicitly:

```bash
CODEX_BIN="$(command -v codex)" pnpm record:codex -- --cd /path/to/your/project -- "Fix the failing validation test"
```

The wrapper runs `codex exec --json`, records allowed observable events, ignores `reasoning` events, and writes a tamper-evident JSON session under `storage/sessions`. Keep the Glasshouse web app open and refresh it after Codex finishes; the saved session appears in the sidebar. Follow [the Codex-first guide](docs/codex-first.md) for details.

Use `--cd` to point to the project you want Codex to edit. The wrapper automatically adds Codex's non-Git-project flag when that directory does not contain a `.git` folder.

For the full install, GPT-5.6 model-selection, recording, and replay workflow, read [Using Codex 5.6 with Glasshouse-lite](docs/using-codex-5-6.md).

Each event includes an ID, timestamp, type, payload, optional duration/metadata, `previous_hash`, and `current_hash`. The hash is `SHA256(previous_hash + timestamp + canonicalized_payload)`. A changed event invalidates it, and its successor will no longer point at the expected chain.

## Demo script (three minutes)

1. Introduce Glasshouse as the black box for coding agents; it captures actions, not private reasoning.
2. Load the session and play the timeline: prompt → file read → code edit → failed test → retry → passing tests.
3. Click the file-write event and show the captured unified diff and hashes.
4. Press **Tamper session**. The status becomes **HASH VERIFICATION FAILED** and the edit is visibly marked.
5. Explain that adapters only need to translate observable agent hooks into events.

## Adapter design

`AgentAdapter` in `@glasshouse/core` gives every future integration a consistent start/stop/event surface. Initial targets: Codex CLI, Claude Code, Gemini CLI, OpenCode, and custom agents.

## Roadmap

- Append-only SQLite/Postgres and signed session exports
- Codex CLI adapter via structured runtime events
- Monaco-powered full file diff, artifact snapshots, and search
- Team session sharing, retention policy, and compliance export
- Adapter registry and OpenTelemetry bridge

## Security model

Glasshouse only records observable events supplied by the host agent. Do not record hidden reasoning, private prompts outside the chosen policy, secrets, or raw environment variables. Hash chaining provides tamper evidence; an attacker can still forge a new complete chain unless sessions are additionally signed and stored append-only — planned for the production path.



# Terminal 2 — record a real Codex execution
cd /Users/ap/Documents/Codex/2026-07-19/build
corepack pnpm record:codex -- --cd /path/to/your/project -- "Fix the failing validation test"
