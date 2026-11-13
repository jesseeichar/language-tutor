import { mock } from "bun:test";

/** Replaces the DOM clipboard for one test and returns the spy that receives copied text. */
export function stubClipboard(writeText: (text: string) => Promise<void> = () => Promise.resolve()) {
  const spy = mock(writeText);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: spy } });
  return spy;
}
