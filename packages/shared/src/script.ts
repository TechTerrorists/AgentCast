import { z } from 'zod';
import { Id, Lang, SchemaVersion } from './common';

export const ScriptSegment = z.object({
  segmentId: Id,
  flowId: Id,
  text: z.string().min(1),
  /** Budget from compressed visual duration × pacing (PRD §9.4). */
  maxSeconds: z.number().positive(),
});
export type ScriptSegment = z.infer<typeof ScriptSegment>;

/** What the LLM writes for one language. Kept separate so it can be used as a --json-schema. */
export const ScriptDraft = z.object({
  hook: z.string().min(1),
  titleCard: z.string().min(1),
  cta: z.string().min(1),
  posting: z.object({
    title: z.string().min(1),
    description: z.string(),
    hashtags: z.array(z.string()),
  }),
  segments: z.array(ScriptSegment).min(1),
});
export type ScriptDraft = z.infer<typeof ScriptDraft>;

/** script/script.<lang>.json */
export const Script = ScriptDraft.extend({
  schemaVersion: SchemaVersion,
  lang: Lang,
});
export type Script = z.infer<typeof Script>;
