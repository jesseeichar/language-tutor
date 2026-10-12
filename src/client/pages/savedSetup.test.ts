import { describe, expect, test } from "bun:test";
import { loadSetup, saveSetup } from "./savedSetup";

const available = { categoryIds: new Set(["a", "b"]), questionTypes: new Set(["t1", "t2"]) };

describe("savedSetup", () => {
  test("defaults when nothing is saved", () => {
    expect(loadSetup("m", available)).toEqual({ categoryIds: [], questionTypes: null, direction: "random" });
  });

  test("round-trips per mode", () => {
    saveSetup("m", { categoryIds: ["a"], questionTypes: ["t2"], direction: "en-de" });
    expect(loadSetup("m", available)).toEqual({ categoryIds: ["a"], questionTypes: ["t2"], direction: "en-de" });
    expect(loadSetup("other", available).categoryIds).toEqual([]);
  });

  test("drops ids that no longer exist and bad values", () => {
    localStorage.setItem("language-tutor:setup:m", JSON.stringify({ categoryIds: ["a", "gone", 7], questionTypes: ["t9"], direction: "up" }));
    expect(loadSetup("m", available)).toEqual({ categoryIds: ["a"], questionTypes: [], direction: "random" });
  });

  test("survives corrupt storage", () => {
    localStorage.setItem("language-tutor:setup:m", "{ nope");
    expect(loadSetup("m", available).direction).toBe("random");
  });
});
