import { z } from 'zod';
import { Aspect, FormFactor, Id, Lang, SchemaVersion } from './common';

export const AuthConfig = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('public') }),
  /** Human signs in once in a TinyFish setup session (PRD §8.2). */
  z.object({ mode: z.literal('sign-in-once'), profileId: z.string().optional() }),
  z.object({ mode: z.literal('vault'), credentialItemIds: z.array(z.string()).min(1) }),
]);
export type AuthConfig = z.infer<typeof AuthConfig>;

export const VideoMode = z.enum(['launch', 'tutorial', 'sales']);
export type VideoMode = z.infer<typeof VideoMode>;

export const JobConfig = z.object({
  url: z.url({ protocol: /^https?$/ }),
  auth: AuthConfig.default({ mode: 'public' }),
  stylePrompt: z.string().max(2000).default(''),
  focusPrompt: z.string().max(2000).optional(),
  mode: VideoMode.default('launch'),
  variants: z
    .object({
      aspects: z.array(Aspect).min(1),
      langs: z.array(Lang).min(1),
      formFactors: z.array(FormFactor).min(1),
    })
    .default({ aspects: ['16x9'], langs: ['en'], formFactors: ['desktop'] }),
  /** Skips gates 1 and 2 (PRD §5.1). */
  autopilot: z.boolean().default(false),
});
export type JobConfig = z.infer<typeof JobConfig>;
export type JobConfigInput = z.input<typeof JobConfig>;

/** jobs/<id>/job.json */
export const Job = z.object({
  schemaVersion: SchemaVersion,
  id: Id,
  createdAt: z.iso.datetime(),
  config: JobConfig,
});
export type Job = z.infer<typeof Job>;

/** Stage graph nodes, in pipeline order (PRD §7.3). */
export const StageName = z.enum([
  'understand',
  'auth',
  'discover',
  'flow-runs',
  'gate-flows',
  'record',
  'script',
  'gate-script',
  'voice',
  'direct',
  'preview',
  'gate-preview',
  'render',
]);
export type StageName = z.infer<typeof StageName>;

export const StageStatus = z.enum(['pending', 'running', 'awaiting_input', 'done', 'failed', 'skipped', 'cancelled']);
export type StageStatus = z.infer<typeof StageStatus>;
