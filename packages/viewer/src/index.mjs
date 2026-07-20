import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const templatePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "template.html");
const placeholder = "__GLASSHOUSE_SESSION__";

/**
 * `<` can only appear inside a JSON string literal, so escaping every occurrence
 * keeps a payload containing `</script>` from closing the host script element.
 * U+2028 and U+2029 are escaped because a JS parser reads them as line terminators.
 */
function embeddable(session) {
  return JSON.stringify(session).replace(/[<\u2028\u2029]/g, (character) =>
    "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0"));
}

/** Builds a self-contained replay page. Pass no session to get the drop-a-file viewer. */
export async function renderSessionHtml(session) {
  const template = await readFile(templatePath, "utf8");
  return template.replace(placeholder, () => (session ? embeddable(session) : "null"));
}
