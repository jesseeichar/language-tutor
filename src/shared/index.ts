/**
 * Public interface of the shared module: the content model, the mode contract,
 * the mode registry and the HTTP API types. Server, client and scripts import
 * shared code only from here. Nothing in shared may use Node, Bun or DOM APIs.
 */
export {
  CategoriesFileSchema,
  GrammarTopicsFileSchema,
  IdSchema,
  QuestionBaseSchema,
  QuestionFileSchema,
  VocabularyFileSchema,
  type Category,
  type GrammarTopic,
  type QuestionBase,
  type Refs,
  type VocabWord,
} from "./content";
export { pointsFor, type AnyModeDefinition, type GradeResult, type GradedMode, type ModeDefinition, type UngradedMode } from "./mode";
export { expandCategories, matchesCategories } from "./categories";
export { getMode, modes } from "./modes/registry";
export type { FlashcardQuestion, FlashcardResponse } from "./modes/flashcards";
export {
  CreateSessionRequestSchema,
  SubmitAnswerRequestSchema,
  type ApiError,
  type CategoryCount,
  type CreateSessionRequest,
  type CreateSessionResponse,
  type ModeSummary,
  type SessionInfo,
  type SessionSummary,
  type SubmitAnswerRequest,
  type SubmitAnswerResponse,
} from "./api";
