import { z } from 'zod';
import { FormFactor, Id, SchemaVersion } from './common';
import { Expectation } from './flow';

export const LocatorStrategy = z.enum(['role', 'label', 'placeholder', 'text', 'llm']);
export type LocatorStrategy = z.infer<typeof LocatorStrategy>;

export const ReplayPlanEntry = z.object({
  strategy: LocatorStrategy,
  /** Serialized Playwright locator, e.g. getByRole('button', { name: 'Create' }). */
  locator: z.string().min(1),
  /** ISO timestamp of the last take where this locator worked. */
  lastOk: z.iso.datetime(),
  /** Learned from the last clean take; preferred over Step.expect (PRD §9.3.1). */
  learnedExpect: z.array(Expectation).optional(),
});
export type ReplayPlanEntry = z.infer<typeof ReplayPlanEntry>;

/** record/<formFactor>/replay-plan.json, cached across re-runs. Keyed by form factor, then step id. */
export const ReplayPlan = z.object({
  schemaVersion: SchemaVersion,
  byFormFactor: z.partialRecord(FormFactor, z.record(Id, ReplayPlanEntry)),
});
export type ReplayPlan = z.infer<typeof ReplayPlan>;
