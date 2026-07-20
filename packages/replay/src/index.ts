import type { GlasshouseEvent } from "@glasshouse/core";

export function eventIndexAtTime(events: GlasshouseEvent[], elapsedMs: number): number {
  if (!events.length) return 0;
  const start = new Date(events[0].timestamp).getTime();
  return Math.max(0, events.findLastIndex((event) => new Date(event.timestamp).getTime() - start <= elapsedMs));
}

export function sessionDuration(events: GlasshouseEvent[]): number {
  if (events.length < 2) return 0;
  return new Date(events.at(-1)!.timestamp).getTime() - new Date(events[0].timestamp).getTime();
}
