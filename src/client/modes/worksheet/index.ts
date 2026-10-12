import type { WorksheetQuestion } from "../../../shared";
import type { ClientMode } from "../types";
import { WorksheetView } from "./WorksheetView";

export const worksheetClient: ClientMode<WorksheetQuestion, { answers: Record<string, string | { word: string; sentence: string }> }> = {
  id: "worksheet", QuestionView: WorksheetView,
};
