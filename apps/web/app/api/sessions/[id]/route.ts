import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import type { Session } from "@glasshouse/core";
import { verifyChain } from "@glasshouse/hash";

const sessionsDirectory = path.resolve(process.cwd(), "../../storage/sessions");

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return NextResponse.json({ error: "Invalid session ID." }, { status: 400 });
  try {
    const session = JSON.parse(await readFile(path.join(sessionsDirectory, `${id}.json`), "utf8")) as Session;
    return NextResponse.json({ session, integrity: await verifyChain(session.events) });
  } catch { return NextResponse.json({ error: "Session not found." }, { status: 404 }); }
}
