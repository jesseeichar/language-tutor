import { describe, expect, test } from "bun:test";
import { cleanCell, firstParagraph, isSeparatorRow, slugify, splitRow } from "./markdown";

describe("slugify", () => {
  test.each([
    ["die Stärke / Stärken", "die-staerke-staerken"],
    ["schließlich", "schliesslich"],
    ["im Anschluss (an + Akk.)", "im-anschluss-an-akk"],
    ["Apéro", "apero"],
  ])("%s -> %s", (input, expected) => expect(slugify(input)).toBe(expected));
});

describe("table helpers", () => {
  test("splitRow returns trimmed cells", () => {
    expect(splitRow("| *a* | b c |")).toEqual(["*a*", "b c"]);
    expect(splitRow("not a row")).toEqual([]);
  });
  test("isSeparatorRow detects --- rows", () => {
    expect(isSeparatorRow(["---", ":---:"])).toBe(true);
    expect(isSeparatorRow(["---", "a"])).toBe(false);
  });
  test("cleanCell strips emphasis and escapes", () => {
    expect(cleanCell("*Das schaffe ich\\!*")).toBe("Das schaffe ich!");
    expect(cleanCell("**an + Akk.**   ok")).toBe("an + Akk. ok");
  });
});

describe("firstParagraph", () => {
  test("skips leading blanks and stops at a table", () => {
    expect(firstParagraph(["", "First line", "continues.", "", "Second."])).toBe("First line continues.");
    expect(firstParagraph(["", "| table |"])).toBe("");
  });
  test("caps long text at a sentence boundary", () => {
    const long = `${"Word ".repeat(50)}end. ${"More ".repeat(60)}`;
    const out = firstParagraph([long]);
    expect(out.length).toBeLessThanOrEqual(400);
    expect(out.endsWith("end.")).toBe(true);
  });
});
