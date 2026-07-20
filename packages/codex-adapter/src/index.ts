import type { EventType, JsonObject } from "@glasshouse/core";

export interface CodexObservableEvent {
  timestamp?: string;
  type: string;
  payload?: JsonObject;
  duration?: number;
  metadata?: JsonObject;
}

export interface NormalizedCodexEvent {
  type: EventType;
  payload: JsonObject;
  duration?: number;
  metadata?: JsonObject;
}

/**
 * Maps a deliberately small, observable Codex event envelope to Glasshouse.
 * Feed it JSONL you produce from an approved Codex wrapper or hook; it does
 * not inspect private model state or attempt to infer reasoning.
 */
export function normalizeCodexEvent(event: CodexObservableEvent): NormalizedCodexEvent | null {
  const typeMap: Record<string, EventType> = {
    session_started: "SESSION_STARTED", user_prompt: "USER_PROMPT", assistant_message: "ASSISTANT_MESSAGE",
    file_read: "FILE_READ", file_write: "FILE_WRITE", command_started: "COMMAND_STARTED",
    command_finished: "COMMAND_FINISHED", stdout: "STDOUT", stderr: "STDERR",
    test_started: "TEST_STARTED", test_finished: "TEST_FINISHED", diff_created: "DIFF_CREATED",
    session_finished: "SESSION_FINISHED"
  };
  const type = typeMap[event.type.toLowerCase()];
  if (!type) return null;
  return { type, payload: event.payload ?? {}, duration: event.duration, metadata: { source: "codex-cli", ...(event.metadata ?? {}) } };
}

export function parseCodexJsonl(contents: string): CodexObservableEvent[] {
  return contents.split("\n").filter(Boolean).map((line, index) => {
    try { return JSON.parse(line) as CodexObservableEvent; }
    catch { throw new Error(`Invalid JSONL event at line ${index + 1}.`); }
  });
}
