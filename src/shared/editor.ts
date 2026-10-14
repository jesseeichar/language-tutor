import { z } from "zod";
import { CategorySchema, IdSchema, type Category } from "./content";

const fields = CategorySchema.omit({ id: true }).extend({
  label: z.string().trim().min(1), group: z.string().trim().min(1),
}).strict();

export const ContentEditSchema = z.strictObject({
  revision: z.string().min(1),
  change: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("create-category"), category: fields }),
    z.strictObject({ kind: z.literal("update-category"), id: IdSchema, category: fields }),
    z.strictObject({ kind: z.literal("delete-category"), id: IdSchema }),
    z.strictObject({ kind: z.literal("assign-categories"), modeId: IdSchema, questionId: IdSchema,
      categoryIds: z.array(IdSchema).min(1).refine((ids) => new Set(ids).size === ids.length, "Select each category once") }),
    /** Adds or removes one question's direct assignment to a list category, leaving its other categories alone. */
    z.strictObject({ kind: z.literal("set-list-membership"), modeId: IdSchema, questionId: IdSchema, categoryId: IdSchema, member: z.boolean() }),
  ]),
});
export type ContentEdit = z.infer<typeof ContentEditSchema>;

export interface EditorSnapshot {
  revision: string;
  categories: Category[];
  usage: Record<string, { questions: number; words: number; topics: number; children: number }>;
  questions: { id: string; modeId: string; modeTitle: string; preview: string; type?: string; categories: string[] }[];
}
