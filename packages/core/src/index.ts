export type EventType =
  | "SESSION_STARTED" | "USER_PROMPT" | "ASSISTANT_MESSAGE" | "FILE_READ" | "FILE_WRITE"
  | "COMMAND_STARTED" | "COMMAND_FINISHED" | "STDOUT" | "STDERR" | "TEST_STARTED"
  | "TEST_FINISHED" | "DIFF_CREATED" | "SESSION_FINISHED";

export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export interface GlasshouseEvent {
  id: string;
  timestamp: string;
  type: EventType;
  payload: JsonObject;
  duration?: number;
  metadata?: JsonObject;
  previous_hash: string;
  current_hash: string;
}

export interface Session {
  id: string;
  title?: string;
  agent: string;
  startedAt: string;
  finishedAt?: string;
  events: GlasshouseEvent[];
}

export interface VerificationResult {
  valid: boolean;
  corruptedEventIds: string[];
}

export interface AgentAdapter {
  start(): Promise<void> | void;
  stop(): Promise<void> | void;
  onEvent(handler: (event: Omit<GlasshouseEvent, "previous_hash" | "current_hash">) => void): void;
}
