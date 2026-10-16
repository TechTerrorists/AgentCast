import { z } from 'zod';
import { Id, SchemaVersion } from './common';

export const StepAction = z.enum(['navigate', 'click', 'type', 'select', 'press', 'scroll', 'hover', 'wait']);
export type StepAction = z.infer<typeof StepAction>;

/** Describes a UI element the way a person sees it, never by CSS selector (PRD §7.1 #1). */
export const SemanticTarget = z.object({
  text: z.string().optional(),
  role: z.string().optional(),
  label: z.string().optional(),
  placeholder: z.string().optional(),
  near: z.string().optional(),
});
export type SemanticTarget = z.infer<typeof SemanticTarget>;

/** Post-step outcome checks (PRD §9.3.1). */
export const Expectation = z.discriminatedUnion('type', [
  z.object({ type: z.literal('url'), pattern: z.string().min(1) }),
  z.object({ type: z.literal('text'), text: z.string().min(1), match: z.enum(['loose', 'exact']) }),
  z.object({ type: z.literal('element'), role: z.string().min(1), name: z.string() }),
  z.object({ type: z.literal('value'), target: z.string().min(1), value: z.string() }),
  z.object({ type: z.literal('changed') }),
]);
export type Expectation = z.infer<typeof Expectation>;

export const Step = z.object({
  id: Id,
  action: StepAction,
  target: SemanticTarget.optional(),
  value: z.string().optional(),
  /** Never shown to an LLM, in captions or in logs. */
  secret: z.boolean().optional(),
  expected: z.string().optional(),
  narrationHint: z.string().optional(),
  screenshotUrl: z.string().optional(),
  expect: z.array(Expectation).optional(),
});
export type Step = z.infer<typeof Step>;

export const StoryRole = z.enum(['setup', 'core', 'payoff', 'share']);
export type StoryRole = z.infer<typeof StoryRole>;

/** Flow scoring rubric (PRD §9.2.1). Judge scores are 0–5, deterministic ones 0–1. */
export const FlowScoring = z.object({
  valueAlignment: z.number().min(0).max(5),
  visiblePayoff: z.number().min(0).max(5),
  lengthFit: z.number().min(0).max(1),
  distinctness: z.number().min(0).max(1),
  focusMatch: z.number().min(0).max(5).optional(),
  riskPenalty: z.number().max(0),
  score: z.number(),
  storyRole: StoryRole,
  valuePropCited: z.string(),
  rationale: z.string(),
});
export type FlowScoring = z.infer<typeof FlowScoring>;

export const Flow = z.object({
  id: Id,
  title: z.string().min(1),
  whyItMatters: z.string(),
  startUrl: z.url(),
  requiresAuth: z.boolean(),
  rank: z.number().int().nonnegative(),
  selected: z.boolean(),
  scoring: FlowScoring.optional(),
  steps: z.array(Step).min(1),
  tinyfishRunId: z.string().optional(),
  /** True when any step matches destructive keywords; forces explicit approval at gate 1. */
  needsApproval: z.boolean().default(false),
});
export type Flow = z.infer<typeof Flow>;

/** explore/flows.json */
export const FlowsFile = z.object({
  schemaVersion: SchemaVersion,
  jobId: Id,
  flows: z.array(Flow),
});
export type FlowsFile = z.infer<typeof FlowsFile>;
