import { z } from 'zod';
import { Id } from './common';
import { StageName, StageStatus } from './job';

const base = { jobId: Id, stage: StageName, at: z.iso.datetime() };

/** Worker → UI events, also appended to jobs/<id>/events.ndjson. */
export const StageEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('stage'), ...base, status: StageStatus, error: z.string().optional() }),
  z.object({ type: z.literal('progress'), ...base, fraction: z.number().min(0).max(1), label: z.string().optional() }),
  z.object({ type: z.literal('log'), ...base, level: z.enum(['debug', 'info', 'warn', 'error']), message: z.string() }),
  /** TinyFish STREAMING_URL for a live agent iframe. */
  z.object({ type: z.literal('live-view'), ...base, runId: z.string(), url: z.string(), label: z.string() }),
  /** Progress from the coding agent (director, script writer). */
  z.object({
    type: z.literal('llm'),
    ...base,
    kind: z.enum(['text', 'tool_use', 'done', 'error']),
    text: z.string(),
  }),
]);
export type StageEvent = z.infer<typeof StageEvent>;
