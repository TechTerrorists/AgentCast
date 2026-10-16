import { z } from 'zod';

/** Every artifact on disk carries this so readers can reject or migrate old files. */
export const SCHEMA_VERSION = 1 as const;
export const SchemaVersion = z.literal(SCHEMA_VERSION);

export const Id = z.string().min(1);

/** x, y, width, height in CSS pixels of the recorded viewport. */
export const Bbox = z.tuple([z.number(), z.number(), z.number().nonnegative(), z.number().nonnegative()]);
export type Bbox = z.infer<typeof Bbox>;

export const Point = z.tuple([z.number(), z.number()]);
export type Point = z.infer<typeof Point>;

export const FormFactor = z.enum(['desktop', 'mobile']);
export type FormFactor = z.infer<typeof FormFactor>;

export const Aspect = z.enum(['16x9', '9x16']);
export type Aspect = z.infer<typeof Aspect>;

/** Language code such as "en", "hi" or "pt-BR". */
export const Lang = z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/, 'expected a language code like "en" or "pt-BR"');
export type Lang = z.infer<typeof Lang>;

/** [start, end] in seconds, start <= end. */
export const Interval = z
  .tuple([z.number().nonnegative(), z.number().nonnegative()])
  .refine(([start, end]) => start <= end, 'interval start must be <= end');
export type Interval = z.infer<typeof Interval>;
