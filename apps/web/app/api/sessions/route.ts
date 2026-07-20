import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import type { Session } from "@glasshouse/core";
import { verifyChain } from "@glasshouse/hash";

const sessionsDirectory = path.resolve(process.cwd(), "../../storage/sessions");

async function ensureSessionsDirectory() { await mkdir(sessionsDirectory, { recursive: true }); }

export async function GET() {
  await ensureSessionsDirectory();
  const files = (await readdir(sessionsDirectory)).filter((file) => file.endsWith(".json"));
  const sessions = await Promise.all(files.map(async (file) => JSON.parse(await readFile(path.join(sessionsDirectory, file), "utf8")) as Session));
  return NextResponse.json(sessions.sort((left, right) => right.startedAt.localeCompare(left.startedAt)));
}

export async function POST(request: Request) {
  const session = await request.json() as Session;
  if (!session.id || !Array.isArray(session.events) || !session.events.length) return NextResponse.json({ error: "A session ID and at least one event are required." }, { status: 400 });
  const integrity = await verifyChain(session.events);
  if (!integrity.valid) return NextResponse.json({ error: "Refusing to persist an invalid event chain.", integrity }, { status: 422 });
  await ensureSessionsDirectory();
  await writeFile(path.join(sessionsDirectory, `${session.id}.json`), JSON.stringify(session, null, 2), { flag: "wx" });
  return NextResponse.json({ id: session.id, integrity }, { status: 201 });
}
