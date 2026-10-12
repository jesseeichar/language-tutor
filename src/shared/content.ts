/**
 * Content model shared by server, client and scripts.
 *
 * Everything under data/ is validated against these schemas when it is loaded,
 * so a typo in a JSON file shows up as a readable error instead of a crash.
 */
import { z } from "zod";

/** Stable identifier: lowercase ASCII, digits and dashes. Never change one once it has progress attached. */
export const IdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, "ids must be lowercase a-z, 0-9 and dashes");

export const CategorySchema = z.object({
  id: IdSchema,
  label: z.string().min(1),
  /** UI grouping only, e.g. "Vokabular" or "Grammatik". */
  group: z.string().min(1),
  /** Optional parent category id. Selecting a parent also selects questions tagged with its children. */
  parent: IdSchema.optional(),
  description: z.string().optional(),
});
export type Category = z.infer<typeof CategorySchema>;

export const VocabWordSchema = z.object({
  id: IdSchema,
  de: z.string().min(1),
  en: z.string().min(1),
  partOfSpeech: z.string().optional(),
  example: z.string().optional(),
  categories: z.array(IdSchema).min(1),
});
export type VocabWord = z.infer<typeof VocabWordSchema>;

export const GrammarTopicSchema = z.object({
  id: IdSchema,
  title: z.string().min(1),
  description: z.string(),
  status: z.string().optional(),
  categories: z.array(IdSchema).min(1),
});
export type GrammarTopic = z.infer<typeof GrammarTopicSchema>;

export const CategoriesFileSchema = z.object({ categories: z.array(CategorySchema) });
export const VocabularyFileSchema = z.object({ words: z.array(VocabWordSchema) });
export const GrammarTopicsFileSchema = z.object({ topics: z.array(GrammarTopicSchema) });

/** Links from a question to the vocabulary words and grammar topics it exercises. Strength scores aggregate over these. */
export const RefsSchema = z.object({
  words: z.array(IdSchema).default([]),
  topics: z.array(IdSchema).default([]),
});
export type Refs = z.infer<typeof RefsSchema>;

/** Fields every question has, whatever its mode. Mode schemas extend this. */
export const QuestionBaseSchema = z.object({
  id: IdSchema,
  categories: z.array(IdSchema).min(1),
  refs: RefsSchema.default({ words: [], topics: [] }),
  /** Overrides the mode's default points. Must be 0 (or absent) in ungraded modes. */
  points: z.number().min(0).optional(),
});
export type QuestionBase = z.infer<typeof QuestionBaseSchema>;

/** A data/questions/<modeId>.json file. Questions are validated by the mode's own schema. */
export const QuestionFileSchema = z.object({
  questions: z.array(z.unknown()),
});
