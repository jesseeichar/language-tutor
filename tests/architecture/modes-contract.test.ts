/** Every mode is complete: shared definition, client view and question file all exist. */
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { modes } from "../../src/shared";
import { clientModes } from "../../src/client/modes";
import { ROOT } from "./source-graph";

describe("mode contract", () => {
  test.each(modes.map((m) => [m.id]))("%s has a client view", (id) => {
    expect(clientModes.some((c) => c.id === id)).toBe(true);
  });

  test.each(modes.map((m) => [m.id]))("%s has data/questions/<id>.json", (id) => {
    expect(existsSync(join(ROOT, "data/questions", `${id}.json`))).toBe(true);
  });

  test("every client view belongs to a registered mode", () => {
    expect(clientModes.filter((c) => !modes.some((m) => m.id === c.id)).map((c) => c.id)).toEqual([]);
  });

  test("graded modes define grade() and points; ungraded ones do not award points", () => {
    for (const m of modes) {
      if (m.graded) {
        expect(typeof m.grade).toBe("function");
        expect(m.defaultPoints).toBeGreaterThan(0);
      } else {
        expect("defaultPoints" in m).toBe(false);
      }
    }
  });
});
