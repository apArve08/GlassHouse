import type { GlasshouseEvent, JsonObject, JsonValue, VerificationResult } from "@glasshouse/core";

export const GENESIS_HASH = "GLASSHOUSE_GENESIS_V1";

export function canonicalize(value: JsonObject): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, sortValue(child)]));
  }
  return value;
}

export async function sha256(input: string): Promise<string> {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function eventHash(previousHash: string, timestamp: string, payload: JsonObject): Promise<string> {
  return sha256(`${previousHash}${timestamp}${canonicalize(payload)}`);
}

export async function verifyChain(events: GlasshouseEvent[]): Promise<VerificationResult> {
  let previousHash = GENESIS_HASH;
  const corruptedEventIds: string[] = [];
  for (const event of events) {
    const expected = await eventHash(previousHash, event.timestamp, event.payload);
    if (event.previous_hash !== previousHash || event.current_hash !== expected) corruptedEventIds.push(event.id);
    previousHash = event.current_hash;
  }
  return { valid: corruptedEventIds.length === 0, corruptedEventIds };
}
