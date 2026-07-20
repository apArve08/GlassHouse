import type { EventType, GlasshouseEvent, JsonObject, Session } from "@glasshouse/core";
import { eventHash, GENESIS_HASH, verifyChain } from "@glasshouse/hash";

export class Glasshouse {
  private session?: Session;

  startSession(agent = "custom-agent") {
    this.session = { id: crypto.randomUUID(), agent, startedAt: new Date().toISOString(), events: [] };
    return this.record({ type: "SESSION_STARTED", payload: { agent } });
  }

  async record(input: { type: EventType; payload: JsonObject; duration?: number; metadata?: JsonObject }) {
    if (!this.session) throw new Error("Call startSession before recording events.");
    const previous_hash = this.session.events.at(-1)?.current_hash ?? GENESIS_HASH;
    const timestamp = new Date().toISOString();
    const event: GlasshouseEvent = { id: crypto.randomUUID(), timestamp, ...input, previous_hash, current_hash: await eventHash(previous_hash, timestamp, input.payload) };
    this.session.events.push(event);
    return event;
  }

  async finish() { await this.record({ type: "SESSION_FINISHED", payload: {} }); if (this.session) this.session.finishedAt = new Date().toISOString(); return this.session; }
  async verify() { return verifyChain(this.requireSession().events); }
  export() { return JSON.stringify(this.requireSession(), null, 2); }
  private requireSession() { if (!this.session) throw new Error("No active session."); return this.session; }
}

export const glasshouse = new Glasshouse();
