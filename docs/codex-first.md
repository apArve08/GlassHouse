# Record a Codex session

Glasshouse currently expects a user-controlled stream of **observable** Codex events. This is intentionally separate from Codex internals: do not scrape or attempt to recover private reasoning.

## 1. Produce an event stream

Your Codex wrapper or approved hook emits JSON Lines as tools complete:

```jsonl
{"type":"session_started","payload":{"repository":"acme/todo-api"}}
{"type":"user_prompt","payload":{"text":"Fix the validation failure"}}
{"type":"file_read","payload":{"path":"src/tasks/validate.ts"}}
{"type":"file_write","payload":{"path":"src/tasks/validate.ts","before":"...","after":"..."}}
{"type":"command_finished","payload":{"command":"pnpm test","exitCode":0},"duration":4380}
{"type":"session_finished","payload":{"outcome":"success"}}
```

## 2. Normalize and record it

```ts
import { Glasshouse } from "@glasshouse/sdk";
import { normalizeCodexEvent, parseCodexJsonl } from "@glasshouse/codex-adapter";

const recorder = new Glasshouse();
await recorder.startSession("codex-cli");

for (const input of parseCodexJsonl(observableCodexJsonl)) {
  const event = normalizeCodexEvent(input);
  if (event && event.type !== "SESSION_STARTED") await recorder.record(event);
}

const session = await recorder.finish();
await fetch("http://localhost:3000/api/sessions", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(session)
});
```

## 3. Replay it

Open the Glasshouse dashboard. Stored recordings appear in **Recorded sessions** in the sidebar. The server verifies a chain before accepting it, and verifies it again whenever a session is loaded.

## Data policy

Only send the prompt, tool calls, file paths/diffs, command results, and test output you deliberately choose to retain. Redact secrets, environment values, access tokens, and private reasoning before writing JSONL.
