import type { Aspect, FormFactor, Lang } from './common';
import type { JobConfig } from './job';

export type Variant = {
  /** Stable id used for file names, e.g. "9x16-hi-desktop". */
  id: string;
  aspect: Aspect;
  lang: Lang;
  /** Which recording the footage comes from. */
  source: FormFactor;
};

/**
 * Expands the job's variant matrix (PRD §9.8, plan Phase 6).
 * 16:9 always uses desktop footage. 9:16 is rendered once per recorded form factor:
 * mobile footage is native, desktop footage is reframed by the virtual camera.
 */
export function expandVariants(variants: JobConfig['variants']): Variant[] {
  const out: Variant[] = [];
  const seen = new Set<string>();
  const add = (aspect: Aspect, lang: Lang, source: FormFactor) => {
    const id = `${aspect}-${lang}-${source}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ id, aspect, lang, source });
  };

  for (const lang of variants.langs) {
    for (const aspect of variants.aspects) {
      if (aspect === '16x9') {
        if (variants.formFactors.includes('desktop')) add(aspect, lang, 'desktop');
      } else {
        for (const ff of variants.formFactors) add(aspect, lang, ff);
      }
    }
  }
  return out;
}
