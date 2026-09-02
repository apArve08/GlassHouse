# Recording a Claude Code session

Claude Code exposes a native hooks system: register a command once in
`.claude/settings.json` and every matching lifecycle event calls it with a
JSON payload on stdin. Glasshouse ships that command as
`bin/glasshouse-claude-hook.mjs`, so recording is passive — unlike the Codex
wrapper, you don't launch Claude Code *through* Glasshouse. You register the
hook once, and every session in that project records itself.

## 1. Wire the hooks

Add this to the `.claude/settings.json` of the project you want to record
(project-level, not this Glasshouse repo, unless you deliberately want to
record Glasshouse's own development):

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "node /path/to/glasshouse-lite/bin/glasshouse-claude-hook.mjs" }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "node /path/to/glasshouse-lite/bin/glasshouse-claude-hook.mjs" }] }],
    "PreToolUse": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node /path/to/glasshouse-lite/bin/glasshouse-claude-hook.mjs" }] }],
    "PostToolUse": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node /path/to/glasshouse-lite/bin/glasshouse-claude-hook.mjs" }] }],
    "Stop": [{ "hooks": [{ "type": "command", "command": "node /path/to/glasshouse-lite/bin/glasshouse-claude-hook.mjs" }] }]
  }
}
```

Use the absolute path to this repo's `bin/glasshouse-claude-hook.mjs`. The
same command works for every event — it reads `hook_event_name` from stdin
and decides what, if anything, to record.

## 2. What gets recorded

| Claude Code event | Tool | Glasshouse event(s) |
| --- | --- | --- |
| `SessionStart` | — | `SESSION_STARTED` |
| `UserPromptSubmit` | — | `USER_PROMPT` |
| `PreToolUse` | `Bash` | `COMMAND_STARTED` |
| `PostToolUse` | `Bash` | `COMMAND_FINISHED`, plus `STDOUT`/`STDERR` if present |
| `PostToolUse` | `Read` | `FILE_READ` |
| `PostToolUse` | `Write`, `Edit`, `NotebookEdit` | `FILE_WRITE` |
| `Stop` | — | `SESSION_FINISHED` |

Everything else — `Grep`, `Glob`, `WebFetch`, `Task`, MCP tool calls,
`Notification`, subagent hooks — is intentionally dropped rather than
approximated. This mirrors the Codex wrapper's stance on `reasoning` events:
Glasshouse only records what it can attribute to a concrete, observable
action.

The hook script never blocks or denies a tool call. It swallows its own
errors and always exits `0`, so a bug in the recorder can't interrupt your
actual Claude Code session.

## 3. Where sessions land

Each Claude Code session gets its own file, keyed by Claude's `session_id`:
`storage/sessions/<session_id>.json`. Because `PreToolUse`/`PostToolUse` can
fire concurrently for parallel tool calls in the same session, the script
takes a short-lived lock file (`<session_id>.json.lock`) around each
read-modify-write so the hash chain can't be corrupted by a race.

Run `pnpm dev` and open `http://localhost:3000` — sessions appear in the
sidebar as soon as the first hook event lands, same as Codex recordings.

## 4. Known gap

`PreToolUse` only records `Bash` commands as they start; every other tool is
recorded from its `PostToolUse` result only, so there's no "in-flight"
timeline entry for a long-running `Write` or `Edit`. If you need that,
extend the `PreToolUse` case in `packages/claude-adapter/src/index.ts` (and
mirror the change in `bin/glasshouse-claude-hook.mjs`, which duplicates the
adapter's logic in plain JS so the hook script has no build step).
