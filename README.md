# Glasshouse-lite

**A flight recorder for coding AI agents.** Glasshouse records what an agent actually did during a coding session, cryptographically links every event into a tamper-evident chain, and replays the whole thing in a visual inspector. It records observable actions only — never hidden reasoning.

## The problem

An AI coding agent edits your files, runs your commands, and changes your repository, usually faster than anyone reads along. Afterwards you are left with a diff and a claim about how it got there. If something is wrong — a weakened validation check, a deleted test, a command nobody expected — there is no record of when it happened or what the agent was reacting to.

Code review shows you the destination. Glasshouse shows you the route.

When an agent reads a file, writes an edit, runs a command, or emits output, those are observable operational events. Glasshouse captures that stream as an immutable, inspectable session timeline: a black box for AI coding work.

## How it works

Recording happens on your machine; replay happens anywhere.

```text
Your computer                                Anywhere
─────────────────────────────                ──────────────────────
glasshouse recorder                          replay viewer
  wraps or hooks the agent                     timeline + diffs
  translates its events        ──session──▶    hash verification
  hash-chains each one           JSON/HTML     no server required
  writes storage/sessions/
```

The recorder must be local — it observes a CLI agent running against your files, which no hosted service can do for you. The viewer is a static page with no backend, so a session can be replayed from a file, a link, or an email attachment without anything being uploaded.

### The event chain

Each event carries an ID, timestamp, type, payload, optional duration and metadata, plus `previous_hash` and `current_hash`:

```
current_hash = SHA256(previous_hash + timestamp + canonicalized_payload)
```

Because every hash commits to its predecessor, editing one event invalidates it *and* every link after it. Deleting or reordering events breaks the chain too. Verification recomputes the whole chain and reports exactly which events failed.

Event types live in `@glasshouse/core`: `SESSION_STARTED`, `USER_PROMPT`, `ASSISTANT_MESSAGE`, `FILE_READ`, `FILE_WRITE`, `COMMAND_STARTED`, `COMMAND_FINISHED`, `STDOUT`, `STDERR`, `TEST_STARTED`, `TEST_FINISHED`, `DIFF_CREATED`, `SESSION_FINISHED`.

## Agent support

| Agent | Status | Mechanism |
| --- | --- | --- |
| Codex CLI | Working | Wrapper around `codex exec --json` |
| Claude Code | Working | `settings.json` hooks (`PreToolUse`/`PostToolUse`/`SessionStart`/`Stop`) |
| Gemini CLI, OpenCode, custom | Planned | `AgentAdapter` contract |

The session format is agent-neutral: `Session.agent` is a plain string and the event types are not tied to any vendor. Any recorder that emits a valid chain replays in the same viewer with no changes.

Note the two integration shapes differ in feel. A wrapper is opt-in — you launch the agent *through* Glasshouse. Hooks are passive — you register them once and every session records itself. Passive capture is the better fit for a flight recorder, which is why Claude Code support is the priority.

## Quick start

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000` and press **Load demo session**. Select timeline events to inspect payloads, diffs, metadata, and their cryptographic links. Press **Tamper session** to mutate a `FILE_WRITE` payload: chain verification immediately turns red and the corrupted event is highlighted.

## Recording a Codex session

```bash
pnpm record:codex -- --cd /path/to/your/project -- "Fix the failing validation test"
```

Use `--cd` to point at the project you want Codex to edit; the wrapper adds Codex's non-Git-project flag automatically when that directory has no `.git`. Add `--model` to choose a model, and `--html` to emit a replay page alongside the JSON.

If Codex cannot be found, install it with `npm install -g @openai/codex`, or point Glasshouse at a nonstandard location:

```bash
CODEX_BIN="$(command -v codex)" pnpm record:codex -- --cd /path/to/your/project -- "Fix the failing test"
```

The wrapper runs `codex exec --json`, records allowed observable events, **ignores `reasoning` events**, and writes a tamper-evident session to `storage/sessions`. Refresh the web app afterwards and the session appears in the sidebar.

See [the Codex-first guide](docs/codex-first.md) and [Using Codex 5.6 with Glasshouse-lite](docs/using-codex-5-6.md) for the full workflow.

## Recording a Claude Code session

Unlike the Codex wrapper, Claude Code recording is passive: register
`bin/glasshouse-claude-hook.mjs` once in a project's `.claude/settings.json`
hooks, and every session in that project records itself from then on, no
per-invocation command needed.

See [the Claude Code hooks guide](docs/claude-code-hooks.md) for the settings
snippet and a table of exactly which hook events and tools get recorded.

## Self-contained replay files

Any session can be emitted as a single HTML file containing both the data and the viewer. No dependencies, no network requests, no server — open it in a browser, attach it to a pull request, or send it to a reviewer.

```bash
# Record and emit the replay file in one step
pnpm record:codex -- --cd /path/to/your/project --html -- "Fix the failing test"

# Convert a session recorded earlier
pnpm session:html storage/sessions/<id>.json

# Build the empty viewer, which accepts any session dropped onto it
pnpm build:viewer
```

Verification runs inside the page: the chain is recomputed from the embedded events on load, so a modified file reports **HASH VERIFICATION FAILED** and highlights the offending event. A typical session is around 35 KB; the viewer alone is 29 KB.

This is the distribution path. The Next.js dashboard stays the local development surface, since it watches `storage/sessions` and lists recordings as they appear.

## Hosting the viewer

`vercel.json` deploys the standalone viewer as a static site. Visitors drop a session file onto the page and it replays entirely client-side — **sessions are never uploaded**, which is what makes a public viewer safe.

```bash
vercel --prod
```

Two things to know:

- **Root Directory must be the repository root** in your Vercel project settings. If it points at `apps/web`, the build runs in the wrong directory and cannot find `bin/`.
- **Install is skipped deliberately.** The viewer has zero dependencies, and skipping install sidesteps the lockfile drift described under Known issues.

To publish a specific session at a permanent URL, generate it into `site/` before deploying (`pnpm session:html <session>.json site/demo.html` → `/demo`). `site/` is gitignored so this is opt-in per file. Treat anything placed there as public: sessions embed real diffs and command output.

The Next.js dashboard is **not** deployable as-is. Its API reads and writes `storage/sessions` on the local filesystem, which does not survive on serverless hosting. Multi-user hosting needs a database and authentication — see Roadmap.

## Repository layout

```text
apps/web             Next.js replay dashboard (local development)
bin/                 Recorder and HTML build CLIs
packages/core        Event, session, and adapter contracts
packages/codex-adapter    Codex `exec --json` event normalization
packages/claude-adapter   Claude Code hook event normalization
packages/hash        Canonical SHA-256 chain + verification
packages/sdk         Small recording API for agent integrations
packages/replay      Time-to-event replay helpers
packages/viewer      Self-contained single-file HTML replay build
packages/ui          Future shared UI primitives
storage/sessions     Recorded sessions
```

## SDK

For instrumenting your own agent:

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

`AgentAdapter` in `@glasshouse/core` gives every integration a consistent start/stop/event surface. An adapter's only job is translating observable agent hooks into Glasshouse events.

## Security model

Glasshouse records only observable events supplied by the host agent. Do not record hidden reasoning, private prompts outside the chosen policy, secrets, or raw environment variables.

Hash chaining provides **tamper evidence, not tamper proofing**. It reliably detects edits, deletions, and reordering of an existing session. It does not stop someone from forging an entirely new, internally consistent chain — that requires signing sessions at the recorder and storing them append-only, which is on the roadmap. Until then, treat a verified chain as evidence the file has not been altered since recording, not as proof of who recorded it.

Because replay is fully client-side, session contents stay on the reviewer's machine. Publishing a session to a public URL is the one action that changes this; do it deliberately.

## Known issues

- `pnpm install --frozen-lockfile` fails: `packages/codex-adapter/package.json` declares `@glasshouse/core` but `pnpm-lock.yaml` has no entry for it. CI defaults to frozen, so any build needing dependencies will break until the lockfile is regenerated.
- `pnpm-lock.yaml` was generated by pnpm 10 while `package.json` pins `pnpm@9.15.0`.
- The viewer implements SHA-256 in plain JavaScript rather than using `crypto.subtle`, so verification works offline from `file://` without a secure context. It is verified against Node's `crypto`, but **it must stay in sync with `packages/hash`** — changing the canonicalization or hash formula means changing both.

## Roadmap

- Gemini CLI adapter via `.gemini/settings.json` `BeforeTool`/`AfterTool` hooks
- File-write fallback (git-diff watch) for agents whose hooks don't cover every write, e.g. Codex's `apply_patch`
- `glasshouse watch` — terminal tail of a session as it records, ahead of a full TUI
- `glasshouse serve` — localhost WebSocket live view feeding the existing replay viewer, instead of only post-hoc HTML export
- Append-only SQLite/Postgres and signed session exports
- Monaco-powered full file diff, artifact snapshots, and search
- Team session sharing, retention policy, and compliance export
- Adapter registry and OpenTelemetry bridge
- Secret redaction before a session is written

## Demo script (three minutes)

1. Introduce Glasshouse as the black box for coding agents: it captures actions, not private reasoning.
2. Load a session and play the timeline: prompt → file read → code edit → failed test → retry → passing tests.
3. Open the file-write event and show the captured unified diff and its hashes.
4. Press **Tamper session**. The status becomes **HASH VERIFICATION FAILED** and the edit is visibly marked.
5. Explain that adapters only need to translate observable agent hooks into events.
