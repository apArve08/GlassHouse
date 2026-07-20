# Using Codex 5.6 with Glasshouse-lite

This guide shows how to use Codex CLI to develop Glasshouse-lite and save a tamper-evident recording of that work in the Glasshouse dashboard.

## 1. Install and sign in to Codex CLI

```bash
npm install -g @openai/codex
codex --version
codex login
```

Complete the browser sign-in flow when Codex opens it. The `codex --version` command confirms your shell can find the CLI.

## 2. Start the Glasshouse dashboard

Open a terminal in this repository:

```bash
cd /Users/ap/Documents/Codex/2026-07-19/build
corepack pnpm install
corepack pnpm dev
```

Open `http://localhost:3000` and leave it running. It is where completed sessions are replayed.

## 3. Ask Codex to work on this project

In a second terminal, run Codex through the Glasshouse recorder:

```bash
cd /Users/ap/Documents/Codex/2026-07-19/build

corepack pnpm record:codex -- \
  --cd /Users/ap/Documents/Codex/2026-07-19/build \
  --model gpt-5.6 \
  -- "Improve the session library and run the TypeScript checks."
```

`--model gpt-5.6` asks Codex CLI to use that model identifier. Keep it only if GPT-5.6 is enabled for your Codex account; otherwise remove the `--model gpt-5.6` line and Codex uses your configured default model.

The wrapper runs `codex exec --json`. It records permitted observable activity only:

- the user prompt and visible agent messages;
- tool command starts, finishes, output, and errors;
- file change events and available diffs;
- session start and finish.

It deliberately ignores reasoning events and never attempts to reconstruct hidden model reasoning.

## 4. View the session

When Codex exits, the wrapper prints a file path like:

```text
Glasshouse recorded 12 observable events: storage/sessions/<session-id>.json
```

Refresh the dashboard. The prompt becomes the session title in **Recorded Sessions**. Click it to replay the timeline, inspect event payloads, and review hashes. Use **Tamper session** to demonstrate the integrity alarm.

## Useful prompts for this repository

```text
Review the Glasshouse event-hash implementation for edge cases. Do not change files; report findings.
```

```text
Improve the replay dashboard's empty states and run the typecheck.
```

```text
Add a focused test for the SHA-256 event chain. Keep the change minimal.
```

## Everyday development without recording

For normal interactive work, run Codex directly:

```bash
cd /Users/ap/Documents/Codex/2026-07-19/build
codex --model gpt-5.6
```

Use the recorded command whenever you want an auditable replay. The current recorder uses `codex exec`, which is a non-interactive Codex execution. It creates one saved Glasshouse session per command.

## Safety and privacy

Do not include access tokens, `.env` contents, or private reasoning in prompts or saved event payloads. Review a session before sharing it, because command output and file diffs may contain project data.
