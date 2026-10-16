import { z } from 'zod';
import { Bbox, FormFactor, Id, SchemaVersion } from './common';

/** Hard cap from the director rules: deeper zooms look blurry at DPR 2. */
export const MAX_ZOOM = 2.5;

/** Bespoke components written by the director live in custom/ and must pass the verify gate. */
const CustomComponent = z.string().regex(/^custom\/[\w-]+$/, 'custom components must be referenced as custom/<Name>');

export const TransitionName = z.union([z.enum(['cut', 'fade', 'slide', 'zoom-through']), CustomComponent]);

export const CameraKeyframe = z.object({
  t: z.number().nonnegative(),
  target: z.union([z.literal('full'), Bbox]),
  zoom: z.number().min(1).max(MAX_ZOOM),
  ease: z.enum(['spring', 'smooth', 'cut']),
});
export type CameraKeyframe = z.infer<typeof CameraKeyframe>;

export const Callout = z.object({
  t: z.number().nonnegative(),
  /** Keyed by language code. */
  text: z.record(z.string(), z.string()),
  anchor: Bbox,
});

export const Card = z.object({
  component: z.union([z.enum(['TitleCard', 'Outro']), CustomComponent]),
  props: z.record(z.string(), z.unknown()),
  seconds: z.number().positive().max(10),
});

export const EdlSegment = z
  .object({
    id: Id,
    flowId: Id,
    formFactorSource: FormFactor.optional(),
    /** Source footage in/out, seconds. */
    in: z.number().nonnegative(),
    out: z.number().nonnegative(),
    maxSpeed: z.number().min(1).max(4).optional(),
    camera: z.array(CameraKeyframe),
    cursor: z.enum(['auto', 'hidden']),
    callouts: z.array(Callout).optional(),
    transitionIn: TransitionName,
  })
  .refine((s) => s.in < s.out, 'segment in must be before out');
export type EdlSegment = z.infer<typeof EdlSegment>;

/** render/edl.json: written by the director, rendered by Remotion (PRD §10). */
export const Edl = z.object({
  schemaVersion: SchemaVersion,
  fps: z.literal(30),
  style: z.object({
    palette: z.object({ bg: z.string(), fg: z.string(), accent: z.string() }),
    font: z.string(),
    pacing: z.enum(['calm', 'balanced', 'punchy']),
    captionStyle: z.enum(['karaoke', 'block', 'minimal']),
    music: z.object({ mood: z.string(), trackId: z.string().optional(), duckDb: z.number().max(0) }),
  }),
  intro: Card,
  segments: z.array(EdlSegment).min(1),
  outro: Card,
});
export type Edl = z.infer<typeof Edl>;
