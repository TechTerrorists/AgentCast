import { z } from 'zod';
import { Bbox, FormFactor, Id, Interval, Point, SchemaVersion } from './common';
import { StepAction } from './flow';

export const CursorMove = z
  .object({ from: Point, to: Point, t0: z.number().nonnegative(), t1: z.number().nonnegative() })
  .refine((c) => c.t0 <= c.t1, 'cursor move must end after it starts');
export type CursorMove = z.infer<typeof CursorMove>;

export const TimelineEvent = z.object({
  /** Seconds in video time. */
  t: z.number().nonnegative(),
  flowId: Id,
  stepId: Id,
  kind: z.union([StepAction, z.literal('settled')]),
  /** Human label, e.g. "Create project". Drives captions and callouts. */
  label: z.string(),
  bbox: Bbox.optional(),
  cursor: CursorMove.optional(),
  value: z.union([z.string(), z.object({ redacted: z.literal(true) })]).optional(),
  url: z.string(),
});
export type TimelineEvent = z.infer<typeof TimelineEvent>;

/** record/<formFactor>/timeline.json: the edit timeline (PRD §10). */
export const Timeline = z
  .object({
    schemaVersion: SchemaVersion,
    recordingId: Id,
    formFactor: FormFactor,
    viewport: z.object({ w: z.number().int().positive(), h: z.number().int().positive(), dpr: z.number().positive() }),
    fps: z.number().int().positive(),
    duration: z.number().nonnegative(),
    flows: z.array(z.object({ flowId: Id, in: z.number().nonnegative(), out: z.number().nonnegative() })),
    events: z.array(TimelineEvent),
    /** Safe-to-cut intervals: locator resolution, slow loads, outcome polling. */
    dead: z.array(Interval),
  })
  .superRefine((tl, ctx) => {
    tl.events.forEach((e, i) => {
      if (e.t > tl.duration) ctx.addIssue({ code: 'custom', path: ['events', i, 't'], message: 'event after end of recording' });
      const prev = tl.events[i - 1];
      if (prev && e.t < prev.t) ctx.addIssue({ code: 'custom', path: ['events', i, 't'], message: 'events must be in time order' });
    });
    tl.flows.forEach((f, i) => {
      if (f.in > f.out) ctx.addIssue({ code: 'custom', path: ['flows', i], message: 'flow in must be <= out' });
    });
  });
export type Timeline = z.infer<typeof Timeline>;
