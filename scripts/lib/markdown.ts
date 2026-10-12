/** Small helpers for reading the Obsidian notes. Not a general Markdown parser. */

const TRANSLITERATION: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss", é: "e", è: "e", à: "a" };

/** "die Stärke / Stärken" -> "die-staerke-staerken" */
export function slugify(text: string): string {
  return text
    .toLocaleLowerCase("de")
    .replace(/[äöüßéèà]/g, (ch) => TRANSLITERATION[ch] ?? ch)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "| a | b |" -> ["a", "b"] (raw, untrimmed of markup). */
export function splitRow(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return [];
  return trimmed
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

export function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c));
}

/** Strips emphasis markers and Markdown escapes from a table cell. */
export function cleanCell(cell: string): string {
  return cell
    .replace(/\\([!*_|#\[\]()-])/g, "$1")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** First block of plain prose in the given lines, skipping blank lines; stops at a heading, table or quote. Capped at ~400 chars. */
export function firstParagraph(lines: string[]): string {
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") {
      if (out.length > 0) break;
      continue;
    }
    if (/^(#|\||>|-{3,})/.test(line)) break;
    out.push(line);
  }
  const text = cleanCell(out.join(" "));
  if (text.length <= 400) return text;
  const cut = text.slice(0, 400);
  const lastStop = cut.lastIndexOf(". ");
  return lastStop > 200 ? cut.slice(0, lastStop + 1) : `${cut.trimEnd()}…`;
}
