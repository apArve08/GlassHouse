#!/usr/bin/env node

/**
 * Turns a recorded session into a self-contained replay page, or builds the
 * empty drop-a-file viewer when no session is given.
 *
 *   node bin/glasshouse-html.mjs storage/sessions/<id>.json [output.html]
 *   node bin/glasshouse-html.mjs --viewer outputs/glasshouse.html
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderSessionHtml } from "../packages/viewer/src/index.mjs";

async function write(target, html) {
  await mkdir(path.dirname(path.resolve(target)), { recursive: true });
  await writeFile(target, html);
}

const [source, destination] = process.argv.slice(2);
if (!source) {
  console.error("Usage: node bin/glasshouse-html.mjs <session.json|--viewer> [output.html]");
  process.exit(1);
}

if (source === "--viewer") {
  const target = destination ?? "glasshouse.html";
  await write(target, await renderSessionHtml(null));
  console.error(`Standalone viewer written to ${target}`);
} else {
  const session = JSON.parse(await readFile(source, "utf8"));
  const target = destination ?? path.join(path.dirname(source), `${path.basename(source, ".json")}.html`);
  await write(target, await renderSessionHtml(session));
  console.error(`Self-contained replay written to ${target}`);
}
