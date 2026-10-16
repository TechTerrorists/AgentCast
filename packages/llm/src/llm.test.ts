import { chmodSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ClaudeCodeBackend, LlmError, childEnv, createLlm, extractJson, type Detection, type LlmBackend, type LlmEvent } from './index';
import { createLimiter } from './limit';

const FAKE = fileURLToPath(new URL('./test/fake-claude.mjs', import.meta.url));
const Score = z.object({ score: z.number().int().min(0).max(5), why: z.string() });

type Call = { args: string[]; stdin: string; cwd: string; hasTinyfishKey: boolean; hasAnthropicKey: boolean; hasOauthToken: boolean };

let dir: string;
let logFile: string;

beforeAll(() => chmodSync(FAKE, 0o755));
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'agentcast-llm-'));
  logFile = join(dir, 'calls.ndjson');
});
afterEach(() => rm(dir, { recursive: true, force: true }));

function backend(scenario: string, extraEnv: NodeJS.ProcessEnv = {}) {
  return new ClaudeCodeBackend({
    bin: FAKE,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      FAKE_SCENARIO: scenario,
      FAKE_LOG: logFile,
      TINYFISH_API_KEY: 'tf-secret',
      ANTHROPIC_API_KEY: 'sk-should-not-leak',
      CLAUDE_CODE_OAUTH_TOKEN: 'oauth',
      ...extraEnv,
    },
  });
}

async function calls(): Promise<Call[]> {
  return (await readFile(logFile, 'utf8')).trim().split('\n').map((l) => JSON.parse(l) as Call);
}

describe('ClaudeCodeBackend.json', () => {
  it('returns validated structured output from a locked-down call', async () => {
    const out = await backend('json-ok').json({ prompt: 'Score this flow', schema: Score, tier: 'fast', cwd: dir });
    expect(out).toEqual({ score: 4, why: 'clear payoff' });

    const [call] = await calls();
    expect(call!.args).toEqual(expect.arrayContaining(['-p', '--restricted', '--strict-mcp-config', '--json-schema', '--no-session-persistence']));
    expect(call!.args).not.toContain('--bare');
    expect(call!.args[call!.args.indexOf('--model') + 1]).toBe('haiku');
    expect(call!.args[call!.args.indexOf('--tools') + 1]).toBe('');
    // the prompt travels on stdin, never argv
    expect(call!.stdin).toBe('Score this flow');
    expect(call!.args.join(' ')).not.toContain('Score this flow');
    expect(call!.cwd).toBe(dir);
  });

  it('strips secrets from the child env but keeps the Claude Code OAuth token', async () => {
    await backend('json-ok').json({ prompt: 'x', schema: Score, tier: 'fast', cwd: dir });
    const [call] = await calls();
    expect(call!.hasTinyfishKey).toBe(false);
    expect(call!.hasAnthropicKey).toBe(false);
    expect(call!.hasOauthToken).toBe(true);
  });

  it('uses the smart model alias for the smart tier, with env override', async () => {
    expect(backend('json-ok').model('smart')).toBe('opus');
    expect(backend('json-ok', { AGENTCAST_LLM_SMART_MODEL: 'sonnet' }).model('smart')).toBe('sonnet');
  });

  it('retries once with the validation errors, then succeeds', async () => {
    const out = await backend('json-invalid-then-ok').json({ prompt: 'Score', schema: Score, tier: 'fast', cwd: dir });
    expect(out).toEqual({ score: 5, why: 'fixed' });
    const log = await calls();
    expect(log).toHaveLength(2);
    expect(log[1]!.stdin).toContain('failed validation');
    expect(log[1]!.stdin).toContain('score');
  });

  it('gives up after one retry', async () => {
    await expect(backend('json-invalid-always').json({ prompt: 'Score', schema: Score, tier: 'fast', cwd: dir })).rejects.toThrow(/validation after one retry/);
    expect(await calls()).toHaveLength(2);
  });

  it('falls back to JSON embedded in the text result', async () => {
    const out = await backend('json-text-only').json({ prompt: 'Score', schema: Score, tier: 'fast', cwd: dir });
    expect(out).toEqual({ score: 2, why: 'from text' });
  });

  it('surfaces CLI errors such as usage limits', async () => {
    const err = await backend('json-error').json({ prompt: 'Score', schema: Score, tier: 'fast', cwd: dir }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect((err as LlmError).detail).toBe('usage limit reached');
  });

  it('kills the process on timeout', async () => {
    await expect(backend('hang').json({ prompt: 'Score', schema: Score, tier: 'fast', cwd: dir, timeoutMs: 300 })).rejects.toThrow(/timed out/);
  });

  it('enables only the Read tool and lists the files when inputs are attached', async () => {
    await backend('json-ok').json({ prompt: 'Pick the element', schema: Score, tier: 'fast', cwd: dir, files: ['aria.yaml', 'step.png'] });
    const [call] = await calls();
    expect(call!.args[call!.args.indexOf('--tools') + 1]).toBe('Read');
    expect(call!.stdin).toContain('- aria.yaml');
    expect(call!.stdin).toContain('- step.png');
  });

  it('reports a clear error when the CLI is missing', async () => {
    const missing = new ClaudeCodeBackend({ bin: join(dir, 'no-such-claude'), env: { PATH: process.env.PATH } });
    await expect(missing.json({ prompt: 'x', schema: Score, tier: 'fast', cwd: dir })).rejects.toThrow(/CLI not found/);
    expect((await missing.detect()).installed).toBe(false);
  });
});

describe('ClaudeCodeBackend.agent', () => {
  it('streams mapped events and returns the session id', async () => {
    const events: LlmEvent[] = [];
    const result = await backend('agent-ok').agent(
      { prompt: 'Read DIRECTOR.md', tier: 'smart', cwd: dir, allowCommands: ['npx tsc --noEmit'] },
      (e) => events.push(e),
    );
    expect(result).toEqual({ sessionId: 'sess-agent', text: 'EDL written' });
    expect(events).toEqual([
      { kind: 'text', text: 'Reading DIRECTOR.md' },
      { kind: 'tool_use', text: 'Edit edl.json' },
      { kind: 'done', text: 'EDL written' },
    ]);

    const [call] = await calls();
    expect(call!.args[call!.args.indexOf('--tools') + 1]).toBe('Read,Write,Edit,Glob,Grep,Bash');
    expect(call!.args).toContain('Bash(npx tsc --noEmit:*)');
    expect(call!.args[call!.args.indexOf('--model') + 1]).toBe('opus');
    expect(call!.args).toEqual(expect.arrayContaining(['--output-format', 'stream-json', '--verbose']));
    expect(call!.args).not.toContain('--resume');
  });

  it('leaves Bash out entirely when no commands are allowed, and resumes sessions', async () => {
    await backend('agent-ok').agent({ prompt: 'Revise', tier: 'smart', cwd: dir, resume: 'sess-agent' });
    const [call] = await calls();
    expect(call!.args[call!.args.indexOf('--tools') + 1]).toBe('Read,Write,Edit,Glob,Grep');
    expect(call!.args).not.toContain('--allowedTools');
    expect(call!.args[call!.args.indexOf('--resume') + 1]).toBe('sess-agent');
  });
});

describe('childEnv', () => {
  it('drops credentials unless opted in', () => {
    const env = childEnv({ PATH: '/bin', TINYFISH_API_KEY: 'a', AGENTCAST_SECRET_KEY: 'b', GITHUB_TOKEN: 'c', ANTHROPIC_API_KEY: 'd', CLAUDE_CODE_OAUTH_TOKEN: 'e' });
    expect(Object.keys(env).sort()).toEqual(['CLAUDE_CODE_OAUTH_TOKEN', 'PATH']);

    const optedIn = childEnv({ ANTHROPIC_API_KEY: 'd', AWS_SECRET_ACCESS_KEY: 'f', AGENTCAST_CLAUDE_USE_API_KEY: '1', AGENTCAST_LLM_KEEP_ENV: 'AWS_SECRET_ACCESS_KEY' });
    expect(optedIn.ANTHROPIC_API_KEY).toBe('d');
    expect(optedIn.AWS_SECRET_ACCESS_KEY).toBe('f');
  });
});

describe('createLlm', () => {
  const stub = (id: Detection['id'], d: Partial<Detection>): LlmBackend => ({
    id,
    detect: async () => ({ id, installed: false, implemented: false, ...d }),
    json: async () => ({ via: id }) as never,
    agent: async () => ({ sessionId: id, text: id }),
  });

  it('auto-selects the first installed and implemented backend', async () => {
    const llm = createLlm({
      env: {},
      backends: [stub('claude-code', { installed: false, implemented: true }), stub('opencode', { installed: true, implemented: false }), stub('codex', { installed: true, implemented: true })],
    });
    expect((await llm.backendFor('smart')).id).toBe('codex');
  });

  it('honours per-tier overrides and explains unusable choices', async () => {
    const backends = [stub('claude-code', { installed: true, implemented: true }), stub('opencode', { installed: true, implemented: false })];
    expect((await createLlm({ env: { AGENTCAST_LLM_FAST: 'claude-code', AGENTCAST_LLM: 'opencode' }, backends }).backendFor('fast')).id).toBe('claude-code');
    await expect(createLlm({ env: { AGENTCAST_LLM: 'opencode' }, backends }).backendFor('smart')).rejects.toThrow(/isn't implemented/);
    await expect(createLlm({ env: { AGENTCAST_LLM: 'gpt' }, backends }).backendFor('smart')).rejects.toThrow(/Unknown LLM backend/);
  });

  it('fails with guidance when nothing is usable', async () => {
    await expect(createLlm({ env: {}, backends: [stub('claude-code', {})] }).backendFor('fast')).rejects.toThrow(/agentcast doctor/);
  });
});

describe('helpers', () => {
  it('extracts JSON from fenced or bare text', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Answer: {"a":[1,2]} done')).toEqual({ a: [1, 2] });
    expect(extractJson('no json here')).toBeUndefined();
  });

  it('limits concurrency', async () => {
    const limit = createLimiter(2);
    let active = 0;
    let peak = 0;
    const task = () =>
      limit(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 20));
        active--;
      });
    await Promise.all(Array.from({ length: 6 }, task));
    expect(peak).toBe(2);
  });
});
