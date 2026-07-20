"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, CircleDot, Clock3, Code2, FileCode2, FlaskConical, FolderOpen, GitBranch, ListVideo, Pause, Play, RotateCcw, Search, ShieldCheck, ShieldX, Terminal, TimerReset, Zap } from "lucide-react";
import type { EventType, GlasshouseEvent, Session } from "@glasshouse/core";
import { eventHash, GENESIS_HASH } from "@glasshouse/hash";

const typeMeta: Record<EventType, { label: string; icon: typeof CircleDot; tone: string }> = {
  SESSION_STARTED: { label: "Session started", icon: Zap, tone: "cyan" }, USER_PROMPT: { label: "Prompt received", icon: CircleDot, tone: "violet" }, ASSISTANT_MESSAGE: { label: "Agent message", icon: Code2, tone: "violet" }, FILE_READ: { label: "Read file", icon: FolderOpen, tone: "blue" }, FILE_WRITE: { label: "Write file", icon: FileCode2, tone: "emerald" }, COMMAND_STARTED: { label: "Command started", icon: Terminal, tone: "amber" }, COMMAND_FINISHED: { label: "Command finished", icon: Terminal, tone: "amber" }, STDOUT: { label: "Output", icon: Terminal, tone: "slate" }, STDERR: { label: "Error output", icon: AlertTriangle, tone: "rose" }, TEST_STARTED: { label: "Tests started", icon: FlaskConical, tone: "amber" }, TEST_FINISHED: { label: "Tests passed", icon: FlaskConical, tone: "emerald" }, DIFF_CREATED: { label: "Diff created", icon: GitBranch, tone: "emerald" }, SESSION_FINISHED: { label: "Session finished", icon: Check, tone: "cyan" }
};

const rawEvents: Array<Omit<GlasshouseEvent, "previous_hash" | "current_hash">> = [
  { id: "evt_001", timestamp: "2026-07-19T09:00:00.000Z", type: "SESSION_STARTED", payload: { agent: "Codex CLI", repository: "acme/todo-api", branch: "fix/task-validation" }, metadata: { model: "gpt-5.6", environment: "local" } },
  { id: "evt_002", timestamp: "2026-07-19T09:00:02.000Z", type: "USER_PROMPT", payload: { text: "Fix validation so completed tasks cannot have an empty title." } },
  { id: "evt_003", timestamp: "2026-07-19T09:00:05.000Z", type: "FILE_READ", payload: { path: "src/tasks/validate.ts", lines: "1-84" }, duration: 42 },
  { id: "evt_004", timestamp: "2026-07-19T09:00:06.000Z", type: "FILE_WRITE", payload: { path: "src/tasks/validate.ts", before: "export function validate(task: Task) {\n  return task.title.length > 0\n}", after: "export function validate(task: Task) {\n  return task.title.trim().length > 0\n}", additions: 1, deletions: 1 }, duration: 18 },
  { id: "evt_005", timestamp: "2026-07-19T09:00:09.000Z", type: "COMMAND_STARTED", payload: { command: "pnpm test", cwd: "/projects/todo-api" } },
  { id: "evt_006", timestamp: "2026-07-19T09:00:15.000Z", type: "STDERR", payload: { output: "FAIL  validates completed task with whitespace title\nExpected: false\nReceived: true", exitCode: 1 }, duration: 6100 },
  { id: "evt_007", timestamp: "2026-07-19T09:00:22.000Z", type: "FILE_WRITE", payload: { path: "src/tasks/validate.ts", before: "return task.title.trim().length > 0", after: "return typeof task.title === 'string' && task.title.trim().length > 0", additions: 1, deletions: 1 }, duration: 26 },
  { id: "evt_008", timestamp: "2026-07-19T09:00:30.000Z", type: "TEST_FINISHED", payload: { command: "pnpm test", passed: 42, failed: 0, status: "passed" }, duration: 4320 },
  { id: "evt_009", timestamp: "2026-07-19T09:00:31.000Z", type: "SESSION_FINISHED", payload: { outcome: "success" } }
];

async function buildEvents() {
  let previous_hash = GENESIS_HASH;
  const events: GlasshouseEvent[] = [];
  for (const event of rawEvents) {
    const current_hash = await eventHash(previous_hash, event.timestamp, event.payload);
    events.push({ ...event, previous_hash, current_hash });
    previous_hash = current_hash;
  }
  return events;
}
function shortHash(hash: string) { return `${hash.slice(0, 10)}…${hash.slice(-6)}`; }
function elapsed(timestamp: string) { return `00:${String(new Date(timestamp).getSeconds()).padStart(2, "0")}`; }
type SessionSummary = Pick<Session, "id" | "title" | "agent" | "startedAt" | "events">;
type SidebarView = "replay" | "events" | "sessions";

export default function Dashboard() {
  const [events, setEvents] = useState<GlasshouseEvent[]>([]); const [selected, setSelected] = useState(0); const [playing, setPlaying] = useState(false); const [speed, setSpeed] = useState(1); const [corrupt, setCorrupt] = useState<string[]>([]); const [storedSessions, setStoredSessions] = useState<SessionSummary[]>([]); const [sessionName, setSessionName] = useState("Fix task validation"); const [agentName, setAgentName] = useState("Codex CLI"); const [saveMessage, setSaveMessage] = useState(""); const [sidebarView, setSidebarView] = useState<SidebarView>("replay");
  useEffect(() => { buildEvents().then(setEvents); }, []);
  useEffect(() => { fetch("/api/sessions").then((response) => response.ok ? response.json() : []).then(setStoredSessions).catch(() => setStoredSessions([])); }, []);
  useEffect(() => { if (!playing) return; const timer = window.setInterval(() => setSelected((current) => { if (current >= events.length - 1) { setPlaying(false); return current; } return current + 1; }), 900 / speed); return () => clearInterval(timer); }, [playing, speed, events.length]);
  const selectedEvent = events[selected];
  const stats = useMemo(() => [{ label: "Session duration", value: "00:31", icon: Clock3 }, { label: "Files modified", value: "1", icon: FileCode2 }, { label: "Commands", value: "2", icon: Terminal }, { label: "Tests run", value: "42", icon: FlaskConical }, { label: "Errors", value: "1", icon: AlertTriangle }, { label: "Est. cost", value: "$0.04", icon: TimerReset }], []);
  async function loadDemo() { setEvents(await buildEvents()); setSessionName("Fix task validation"); setAgentName("Codex CLI"); setSelected(0); setCorrupt([]); setPlaying(false); }
  async function loadStoredSession(id: string) { const response = await fetch(`/api/sessions/${id}`); if (!response.ok) return; const { session, integrity } = await response.json() as { session: Session; integrity: { corruptedEventIds: string[] } }; setEvents(session.events); setSessionName(session.title ?? "Recorded Codex session"); setAgentName(session.agent); setCorrupt(integrity.corruptedEventIds); setSelected(0); setPlaying(false); }
  async function saveCurrentSession() {
    if (!events.length || corrupt.length) { setSaveMessage("Fix integrity before saving."); return; }
    setSaveMessage("Saving…");
    const promptEvent = events.find((event) => event.type === "USER_PROMPT");
    const prompt = typeof promptEvent?.payload.text === "string" ? promptEvent.payload.text : "Recorded Codex session";
    const session: Session = { id: crypto.randomUUID(), title: prompt.slice(0, 72), agent: agentName.toLowerCase().replaceAll(" ", "-"), startedAt: events[0].timestamp, finishedAt: events.at(-1)?.timestamp, events };
    const response = await fetch("/api/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(session) });
    if (!response.ok) { setSaveMessage("Unable to save session."); return; }
    setStoredSessions((current) => [session, ...current]); setSessionName(session.id); setSaveMessage("Saved to Recorded sessions.");
  }
  async function tamper() { const copied = events.map((event) => ({ ...event, payload: { ...event.payload } })); const target = copied[3]; target.payload.after = "export function validate() { return true }"; setEvents(copied); setCorrupt([target.id]); setSelected(3); setPlaying(false); }
  return <main>
    <aside className="sidebar"><div className="brand"><div className="brand-mark"><ShieldCheck size={18}/></div><span>glasshouse</span><em>lite</em></div><div className="workspace"><span className="eyebrow">WORKSPACE</span><button className="repo"><span className="repo-dot"/> acme/todo-api <ChevronRight size={14}/></button></div><nav><button className={sidebarView === "replay" ? "active" : ""} onClick={() => setSidebarView("replay")}><ListVideo size={17}/> Session replay</button><button className={sidebarView === "events" ? "active" : ""} onClick={() => setSidebarView("events")}><Search size={17}/> Explore events</button><button className={sidebarView === "sessions" ? "active" : ""} onClick={() => setSidebarView("sessions")}><GitBranch size={17}/> Saved sessions</button></nav><div className="saved-sessions"><span className="eyebrow">RECORDED SESSIONS</span>{storedSessions.length ? storedSessions.slice(0, 3).map((session) => <button onClick={() => { setSidebarView("replay"); loadStoredSession(session.id); }} key={session.id}><span className="repo-dot"/><span>{session.title ?? "Recorded Codex session"}<small>{session.agent} · {session.events.length} events</small></span></button>) : <p>No stored sessions yet.<br/>Waiting for a Codex wrapper.</p>}</div><div className="side-bottom"><div className="recording"><span className="pulse"/> Recorder endpoint ready</div><button onClick={loadDemo} className="ghost-button"><RotateCcw size={15}/> Load demo session</button></div></aside>
    <section className="content"><header><div><p className="eyebrow">{sidebarView === "events" ? "EVENT EXPLORER" : sidebarView === "sessions" ? "SESSION LIBRARY" : "SESSION / 19 JUL 2026"}</p><h1>{sidebarView === "events" ? "Explore captured events" : sidebarView === "sessions" ? "Saved recordings" : sessionName} <span>· {sidebarView === "replay" ? agentName : `${storedSessions.length} available`}</span></h1></div><div className="header-actions"><div className={`integrity ${corrupt.length ? "bad" : "good"}`}>{corrupt.length ? <ShieldX size={17}/> : <ShieldCheck size={17}/>} {corrupt.length ? "Integrity check failed" : "Verified"}</div><button onClick={saveCurrentSession} className="save-session"><ShieldCheck size={15}/> Save current</button><button onClick={tamper} className="tamper"><AlertTriangle size={15}/> Tamper session</button></div></header>{saveMessage && <p className="save-message">{saveMessage}</p>}
      <div className="stats">{stats.map(({label,value,icon:Icon}) => <div className="stat" key={label}><Icon size={15}/><span>{label}</span><strong>{value}</strong></div>)}</div>
      <div className="replay-grid"><section className="timeline-panel"><div className="panel-head"><div><span className="eyebrow">EVENT TIMELINE</span><strong>{events.length} events captured</strong></div><span className="live-dot">immutable log</span></div><div className="timeline">{events.map((event, index) => { const meta = typeMeta[event.type]; const Icon = meta.icon; const isBad = corrupt.includes(event.id); return <button onClick={() => { setSelected(index); setPlaying(false); }} className={`event ${selected === index ? "selected" : ""} ${isBad ? "corrupt" : ""}`} key={event.id}><time>{elapsed(event.timestamp)}</time><span className={`event-icon ${meta.tone}`}><Icon size={15}/></span><span className="event-copy"><b>{meta.label}</b><small>{String(event.payload.path ?? event.payload.command ?? event.payload.text ?? event.payload.output ?? event.payload.outcome ?? "")}</small></span>{isBad && <AlertTriangle className="bad-icon" size={16}/>}</button>; })}</div><div className="controls"><button onClick={() => setSelected(Math.max(0, selected - 1))}><ChevronLeft size={18}/></button><button className="play" onClick={() => setPlaying(!playing)}>{playing ? <Pause size={18}/> : <Play size={18}/>}</button><button onClick={() => setSelected(Math.min(events.length - 1, selected + 1))}><ChevronRight size={18}/></button><div className="scrubber"><span style={{width: `${events.length ? (selected / (events.length - 1)) * 100 : 0}%`}}/></div><button className="speed" onClick={() => setSpeed(speed === 1 ? 2 : speed === 2 ? .5 : 1)}>{speed}×</button></div></section>
      <section className="inspector-panel">{selectedEvent && <motion.div key={selectedEvent.id} initial={{opacity:0,y:6}} animate={{opacity:1,y:0}}><div className="inspector-title"><span className={`event-icon ${typeMeta[selectedEvent.type].tone}`}>{(() => { const Icon = typeMeta[selectedEvent.type].icon; return <Icon size={17}/> })()}</span><div><span className="eyebrow">INSPECTOR</span><h2>{typeMeta[selectedEvent.type].label}</h2></div><span className="timestamp">{elapsed(selectedEvent.timestamp)}</span></div>{selectedEvent.type === "FILE_WRITE" ? <Diff event={selectedEvent}/> : <Payload event={selectedEvent}/>}<div className="hash-box"><div><span>Previous hash</span><code>{shortHash(selectedEvent.previous_hash)}</code></div><div><span>Current hash</span><code>{shortHash(selectedEvent.current_hash)}</code></div><div className={corrupt.includes(selectedEvent.id) ? "hash-status invalid" : "hash-status"}>{corrupt.includes(selectedEvent.id) ? <><ShieldX size={15}/> HASH VERIFICATION FAILED</> : <><Check size={15}/> CRYPTOGRAPHICALLY LINKED</>}</div></div></motion.div>}</section></div></section>
  </main>;
}

function Payload({event}:{event:GlasshouseEvent}) { return <div className="payload"><div className="detail-row"><span>Event ID</span><code>{event.id}</code></div>{event.duration && <div className="detail-row"><span>Duration</span><b>{event.duration} ms</b></div>}<p className="section-label">PAYLOAD</p><pre>{JSON.stringify(event.payload, null, 2)}</pre>{event.metadata && <><p className="section-label">METADATA</p><pre>{JSON.stringify(event.metadata, null, 2)}</pre></>}</div>; }
function Diff({event}:{event:GlasshouseEvent}) { return <div className="diff"><div className="diff-tabs"><b>Unified diff</b><span>Before / after captured</span></div><pre>{String(event.payload.before).split("\n").map((line, i)=><div className="removed" key={`b${i}`}>− {line}</div>)}{String(event.payload.after).split("\n").map((line, i)=><div className="added" key={`a${i}`}>+ {line}</div>)}</pre><div className="detail-row"><span>Path</span><code>{String(event.payload.path)}</code></div></div>; }
