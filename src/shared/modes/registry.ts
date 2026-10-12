/**
 * Registry of every mode. Adding a mode = add its definition file next to this
 * one, list it here, export its question/response types from src/shared/index.ts,
 * add a view in src/client/modes, and create data/questions/<id>.json.
 * See AGENTS.md, "Adding a new mode".
 */
import type { AnyModeDefinition } from "../mode";
import { flashcardsMode } from "./flashcards";
import { quizMode } from "./quiz";

export const modes: readonly AnyModeDefinition[] = [flashcardsMode, quizMode];

export function getMode(id: string): AnyModeDefinition | undefined {
  return modes.find((m) => m.id === id);
}
