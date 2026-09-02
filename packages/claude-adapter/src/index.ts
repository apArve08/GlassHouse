import type { EventType, JsonObject, JsonValue } from "@glasshouse/core";

export interface ClaudeHookEvent {
  session_id: string;
  hook_event_name: string;
  cwd?: string;
  tool_name?: string;
  tool_input?: JsonObject;
  tool_response?: JsonObject;
  prompt?: string;
  source?: string;
  [key: string]: JsonValue | undefined;
}

export interface NormalizedClaudeEvent {
  type: EventType;
  payload: JsonObject;
  duration?: number;
  metadata?: JsonObject;
}

const FILE_READ_TOOLS = new Set(["Read"]);
const FILE_WRITE_TOOLS = new Set(["Write", "Edit", "NotebookEdit"]);

function asJsonObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function filePathFrom(input: JsonObject): JsonValue {
  return input.file_path ?? input.notebook_path ?? "unknown";
}

/**
 * Maps a single Claude Code hook invocation (one JSON object Claude Code
 * writes to a hook command's stdin) to zero or more Glasshouse events. Only
 * tool calls attributable to an observable file or command action are
 * recorded; subagent hooks, Notification, and unmapped tools are dropped
 * rather than guessed at, matching Codex's stance on unobservable state.
 */
export function normalizeClaudeHookEvent(event: ClaudeHookEvent): NormalizedClaudeEvent[] {
  const metadata: JsonObject = { source: "claude-code", hookEvent: event.hook_event_name };
  const toolInput = asJsonObject(event.tool_input);

  switch (event.hook_event_name) {
    case "SessionStart":
      return [{ type: "SESSION_STARTED", payload: { cwd: event.cwd ?? "", source: event.source ?? "startup" }, metadata }];

    case "UserPromptSubmit":
      return event.prompt ? [{ type: "USER_PROMPT", payload: { text: event.prompt }, metadata }] : [];

    case "PreToolUse":
      if (event.tool_name === "Bash") {
        return [{
          type: "COMMAND_STARTED",
          payload: { command: toolInput.command ?? "", cwd: event.cwd ?? "" },
          metadata: { ...metadata, toolName: event.tool_name }
        }];
      }
      return [];

    case "PostToolUse": {
      const toolName = event.tool_name ?? "unknown";
      const response = asJsonObject(event.tool_response);

      if (toolName === "Bash") {
        const events: NormalizedClaudeEvent[] = [{
          type: "COMMAND_FINISHED",
          payload: { command: toolInput.command ?? "", cwd: event.cwd ?? "" },
          metadata: { ...metadata, toolName }
        }];
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
          payload: {
            path: filePathFrom(toolInput),
            content: toolInput.content ?? toolInput.new_source ?? null,
            oldString: toolInput.old_string ?? null,
            newString: toolInput.new_string ?? null
          },
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
