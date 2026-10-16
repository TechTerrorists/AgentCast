import { execFile } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createLlm, LlmError, type Tier } from '@agentcast/llm';
import { z } from 'zod';

const exec = promisify(execFile);

type Level = 'ok' | 'warn' | 'fail';
type Check = { level: Level; name: string; detail: string };

const MIN_NODE_MAJOR = 22;

async function version(bin: string, args: string[]): Promise<string | undefined> {
  try {
    const { stdout } = await exec(bin, args, { timeout: 15_000 });
    return stdout.trim().split('\n')[0];
  } catch {
    return undefined;
  }
}

function checkNode(): Check {
  const major = Number(process.versions.node.split('.')[0]);
  return major >= MIN_NODE_MAJOR
    ? { level: 'ok', name: 'Node.js', detail: process.version }
    : { level: 'fail', name: 'Node.js', detail: `${process.version}, need ${MIN_NODE_MAJOR}+` };
}

async function checkTools(): Promise<Check[]> {
  const pnpm = await version('pnpm', ['--version']);
  const ffmpeg = await version('ffmpeg', ['-version']);
  const pwCache = join(homedir(), '.cache', 'ms-playwright');
  const chromium = existsSync(pwCache) && readdirSync(pwCache).some((d) => d.startsWith('chromium'));
  return [
    pnpm ? { level: 'ok', name: 'pnpm', detail: pnpm } : { level: 'fail', name: 'pnpm', detail: 'not found' },
    ffmpeg
      ? { level: 'ok', name: 'ffmpeg', detail: ffmpeg.replace(/ Copyright.*/, '') }
      : { level: 'warn', name: 'ffmpeg', detail: 'not on PATH (needed to turn screencast frames into MP4)' },
    chromium
      ? { level: 'ok', name: 'Chromium (Playwright)', detail: 'installed' }
      : { level: 'warn', name: 'Chromium (Playwright)', detail: 'not installed; run `npx playwright install chromium` (local recorder tests)' },
  ];
}

function checkKeys(env: NodeJS.ProcessEnv): Check[] {
  // Presence only for now; authenticated checks arrive with packages/tinyfish and packages/voice.
  const key = (name: string, usedFor: string): Check =>
    env[name] ? { level: 'ok', name, detail: 'set' } : { level: 'warn', name, detail: `not set (needed for ${usedFor})` };
  return [key('TINYFISH_API_KEY', 'explore + record, spikes S1–S3'), key('ELEVENLABS_API_KEY', 'voiceover, spike S5')];
}

async function checkLlm(env: NodeJS.ProcessEnv, probe: boolean): Promise<Check[]> {
  const llm = createLlm({ env });
  const checks: Check[] = [];

  for (const d of await llm.detectAll()) {
    const name = `LLM: ${d.id}`;
    if (!d.installed) checks.push({ level: 'ok', name, detail: `not installed${d.detail ? ` (${d.detail})` : ''}` });
    else if (!d.implemented) checks.push({ level: 'warn', name, detail: `${d.version ?? 'detected'}, adapter not implemented yet` });
    else checks.push({ level: 'ok', name, detail: d.version ?? 'installed' });
  }

  for (const tier of ['smart', 'fast'] as Tier[]) {
    try {
      const backend = await llm.backendFor(tier);
      checks.push({ level: 'ok', name: `LLM ${tier} tier`, detail: `→ ${backend.id}` });
    } catch (err) {
      checks.push({ level: 'fail', name: `LLM ${tier} tier`, detail: (err as Error).message });
    }
  }

  if (probe) checks.push(await probeFastTier(llm));
  return checks;
}

/** One tiny structured-output call, to prove the CLI is logged in. Uses a little of your quota. */
async function probeFastTier(llm: ReturnType<typeof createLlm>): Promise<Check> {
  const dir = await mkdtemp(join(tmpdir(), 'agentcast-probe-'));
  const started = Date.now();
  try {
    const out = await llm.json({
      prompt: 'Health check. Return ok=true.',
      schema: z.object({ ok: z.literal(true) }),
      tier: 'fast',
      cwd: dir,
      timeoutMs: 90_000,
    });
    return { level: 'ok', name: 'LLM probe (fast tier)', detail: `ok=${out.ok} in ${((Date.now() - started) / 1000).toFixed(1)}s` };
  } catch (err) {
    const detail = err instanceof LlmError && err.detail ? `${err.message}: ${err.detail}` : (err as Error).message;
    return { level: 'fail', name: 'LLM probe (fast tier)', detail };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const SYMBOL: Record<Level, string> = { ok: '✓', warn: '!', fail: '✗' };

/** `agentcast doctor [--probe]` (FR-104). Returns the process exit code. */
export async function doctor(opts: { probe: boolean; env?: NodeJS.ProcessEnv }): Promise<number> {
  const env = opts.env ?? process.env;
  const checks = [checkNode(), ...(await checkTools()), ...checkKeys(env), ...(await checkLlm(env, opts.probe))];

  const width = Math.max(...checks.map((c) => c.name.length));
  for (const c of checks) console.log(`${SYMBOL[c.level]} ${c.name.padEnd(width)}  ${c.detail}`);

  const failed = checks.filter((c) => c.level === 'fail').length;
  const warned = checks.filter((c) => c.level === 'warn').length;
  console.log(`\n${failed ? `${failed} problem(s)` : 'Ready'}${warned ? `, ${warned} warning(s)` : ''}.${opts.probe ? '' : ' Add --probe to test the LLM login.'}`);
  return failed ? 1 : 0;
}
