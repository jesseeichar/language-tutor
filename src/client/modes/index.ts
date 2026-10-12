/** Browser-side mode registry. Every mode in src/shared/modes/index.ts needs an entry here. */
import { flashcardsClient } from "./flashcards";
import { quizClient } from "./quiz";
import type { AnyClientMode } from "./types";

const clientModes: readonly AnyClientMode[] = [flashcardsClient, quizClient];

export function getClientMode(id: string): AnyClientMode | undefined {
  return clientModes.find((m) => m.id === id);
}

export { clientModes };
