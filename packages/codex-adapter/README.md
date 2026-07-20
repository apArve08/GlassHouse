# Codex adapter

The adapter accepts a JSON Lines stream emitted by a user-controlled Codex wrapper or hook. Every line has a `type` and optional observable `payload`, `duration`, and `metadata`.

```json
{"type":"user_prompt","payload":{"text":"Fix the failing test"}}
{"type":"file_write","payload":{"path":"src/task.ts","before":"...","after":"..."}}
{"type":"command_finished","payload":{"command":"pnpm test","exitCode":0}}
```

Use `normalizeCodexEvent()` to map each permitted event to the Glasshouse SDK. Do not place private reasoning, credentials, or environment secrets in the JSONL source.
