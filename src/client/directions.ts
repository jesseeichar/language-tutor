import type { DirectionChoice } from "../shared";

/** How directions are named in the UI. Shared by the setup screen and the mode views. */
export const DIRECTION_LABELS: Record<DirectionChoice, string> = {
  "de-en": "German → English",
  "en-de": "English → German",
  random: "Random, card by card",
};
