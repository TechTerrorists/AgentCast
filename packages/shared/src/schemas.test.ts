import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Edl, FlowsFile, JobConfig, ScriptDraft, StageEvent, Timeline, expandVariants } from './index';

const flowsFixture = {
  schemaVersion: 1,
  jobId: 'job_1',
  flows: [
    {
      id: 'f1',
      title: 'Create a project from a template',
      whyItMatters: 'Shows instant setup',
      startUrl: 'https://demoboard.example/dashboard',
      requiresAuth: true,
      rank: 0,
      selected: true,
      steps: [
        { id: 's1', action: 'click', target: { text: 'New project', role: 'button' } },
        { id: 's2', action: 'type', target: { label: 'Project name' }, value: 'Q4 Launch', expect: [{ type: 'value', target: 'Project name', value: 'Q4 Launch' }] },
        { id: 's3', action: 'click', target: { text: 'Create', role: 'button' }, expect: [{ type: 'url', pattern: '/projects/*' }] },
      ],
    },
  ],
};

const timelineFixture = {
  schemaVersion: 1,
  recordingId: 'rec_1',
  formFactor: 'desktop',
  viewport: { w: 1440, h: 900, dpr: 2 },
  fps: 30,
  duration: 12,
  flows: [{ flowId: 'f1', in: 0, out: 12 }],
  events: [
    { t: 4.2, flowId: 'f1', stepId: 's1', kind: 'click', label: 'New project', bbox: [812, 344, 120, 40], cursor: { from: [400, 300], to: [872, 364], t0: 3.8, t1: 4.2 }, url: 'https://demoboard.example/dashboard' },
    { t: 5.0, flowId: 'f1', stepId: 's1', kind: 'settled', label: 'New project', url: 'https://demoboard.example/dashboard' },
  ],
  dead: [[0.5, 1.4]],
};

const edlFixture = {
  schemaVersion: 1,
  fps: 30,
  style: {
    palette: { bg: '#0b0b10', fg: '#ffffff', accent: '#7c5cff' },
    font: 'Inter',
    pacing: 'punchy',
    captionStyle: 'karaoke',
    music: { mood: 'uplifting', duckDb: -18 },
  },
  intro: { component: 'TitleCard', props: { title: 'DemoBoard' }, seconds: 2.5 },
  segments: [
    {
      id: 'seg1',
      flowId: 'f1',
      in: 3.5,
      out: 9,
      camera: [
        { t: 3.8, target: 'full', zoom: 1, ease: 'smooth' },
        { t: 4.2, target: [812, 344, 120, 40], zoom: 1.8, ease: 'spring' },
      ],
      cursor: 'auto',
      transitionIn: 'fade',
    },
  ],
  outro: { component: 'custom/BrandOutro', props: {}, seconds: 3 },
};

describe('artifact schemas', () => {
  it('accepts a valid flows file and defaults needsApproval', () => {
    const parsed = FlowsFile.parse(flowsFixture);
    expect(parsed.flows[0]?.needsApproval).toBe(false);
  });

  it('rejects an unknown expectation type', () => {
    const bad = structuredClone(flowsFixture);
    (bad.flows[0]!.steps[0] as Record<string, unknown>).expect = [{ type: 'vibes' }];
    expect(FlowsFile.safeParse(bad).success).toBe(false);
  });

  it('accepts a valid timeline', () => {
    expect(Timeline.safeParse(timelineFixture).success).toBe(true);
  });

  it('rejects out-of-order timeline events and backwards dead intervals', () => {
    const unordered = structuredClone(timelineFixture);
    unordered.events.reverse();
    expect(Timeline.safeParse(unordered).success).toBe(false);

    const backwards = { ...structuredClone(timelineFixture), dead: [[2, 1]] };
    expect(Timeline.safeParse(backwards).success).toBe(false);
  });

  it('accepts a valid EDL with a custom outro', () => {
    expect(Edl.safeParse(edlFixture).success).toBe(true);
  });

  it('rejects zoom beyond the cap and custom components outside custom/', () => {
    const tooDeep = structuredClone(edlFixture);
    tooDeep.segments[0]!.camera[1]!.zoom = 4;
    expect(Edl.safeParse(tooDeep).success).toBe(false);

    const escaped = structuredClone(edlFixture);
    escaped.outro.component = '../../etc/Outro';
    expect(Edl.safeParse(escaped).success).toBe(false);
  });

  it('fills job config defaults and rejects non-http urls', () => {
    const cfg = JobConfig.parse({ url: 'https://demoboard.example' });
    expect(cfg.auth).toEqual({ mode: 'public' });
    expect(cfg.variants.langs).toEqual(['en']);
    expect(JobConfig.safeParse({ url: 'file:///etc/passwd' }).success).toBe(false);
  });

  it('validates stage events', () => {
    const ev = { type: 'live-view', jobId: 'job_1', stage: 'discover', at: new Date().toISOString(), runId: 'r1', url: 'https://x', label: 'agent 1' };
    expect(StageEvent.safeParse(ev).success).toBe(true);
  });

  it('converts LLM-facing schemas to JSON Schema for --json-schema', () => {
    const schema = z.toJSONSchema(ScriptDraft) as { type: string; required: string[] };
    expect(schema.type).toBe('object');
    expect(schema.required).toContain('segments');
  });
});

describe('expandVariants', () => {
  it('renders 16:9 from desktop and 9:16 once per recorded form factor', () => {
    const ids = expandVariants({ aspects: ['16x9', '9x16'], langs: ['en', 'hi'], formFactors: ['desktop', 'mobile'] }).map((v) => v.id);
    expect(ids).toEqual([
      '16x9-en-desktop',
      '9x16-en-desktop',
      '9x16-en-mobile',
      '16x9-hi-desktop',
      '9x16-hi-desktop',
      '9x16-hi-mobile',
    ]);
  });

  it('skips 16:9 when only mobile is recorded', () => {
    const ids = expandVariants({ aspects: ['16x9', '9x16'], langs: ['en'], formFactors: ['mobile'] }).map((v) => v.id);
    expect(ids).toEqual(['9x16-en-mobile']);
  });
});
