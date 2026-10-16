import { childEnv } from '../env';
import { extractJson, formatIssues, readResultFile, toJsonSchema } from '../json-output';
import { runProcess, type RunResult } from '../spawn';
import {
  LlmError,
  type AgentResult,
  type AgentTask,
  type Detection,
  type JsonTask,
  type LlmBackend,
  type LlmEvent,
  type Tier,
} from '../types';

const JSON_TIMEOUT_MS = 3 * 60_000;
const AGENT_TIMEOUT_MS = 10 * 60_000;

/**
 * Applied to every call (PRD §9.9): no MCP servers, no user/project settings, file tools confined
 * to cwd, and anything not explicitly allowed is denied because headless mode can't prompt.
 * Never add --bare: it only accepts ANTHROPIC_API_KEY and ignores the subscription login.
 */
const LOCKDOWN_FLAGS = ['--restricted', '--strict-mcp-config', '--permission-mode', 'acceptEdits'];

const AGENT_TOOLS = ['Read', 'Write', 'Edit', 'Glob', 'Grep'];

/** The fields we use from `--output-format json` and the final `stream-json` message. */
type ClaudeResult = {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  session_id?: string;
  structured_output?: unknown;
};

type StreamMessage = ClaudeResult & {
  message?: { content?: Array<{ type?: string; text?: string; name?: string; input?: Record<string, unknown> }> };
};

export type ClaudeCodeOptions = {
  /** Path to the CLI; defaults to AGENTCAST_CLAUDE_BIN or `claude` on PATH. */
  bin?: string;
  env?: NodeJS.ProcessEnv;
};

/** Drives the locally installed, logged-in Claude Code CLI. No API key needed. */
export class ClaudeCodeBackend implements LlmBackend {
  readonly id = 'claude-code' as const;
  private readonly bin: string;
  private readonly env: NodeJS.ProcessEnv;

  constructor(opts: ClaudeCodeOptions = {}) {
    this.env = opts.env ?? process.env;
    this.bin = opts.bin ?? this.env.AGENTCAST_CLAUDE_BIN ?? 'claude';
  }

  /** Aliases, so new model versions need no code change. */
  model(tier: Tier): string {
    return tier === 'smart' ? this.env.AGENTCAST_LLM_SMART_MODEL || 'opus' : this.env.AGENTCAST_LLM_FAST_MODEL || 'haiku';
  }

  async detect(): Promise<Detection> {
    try {
      const r = await this.run({ args: ['--version'], cwd: process.cwd(), timeoutMs: 15_000 });
      if (r.code !== 0) return { id: this.id, installed: false, implemented: true, detail: tail(r.stderr) || `exit ${r.code}` };
      return { id: this.id, installed: true, implemented: true, version: r.stdout.trim().split('\n')[0] };
    } catch (err) {
      return { id: this.id, installed: false, implemented: true, detail: (err as Error).message };
    }
  }

  async json<T>(task: JsonTask<T>): Promise<T> {
    const basePrompt = withFileHints(task.prompt, task.files ?? []);
    let prompt = basePrompt;

    for (let attempt = 1; ; attempt++) {
      const raw = await this.runJsonOnce(task, prompt);
      const parsed = task.schema.safeParse(raw);
      if (parsed.success) return parsed.data;
      if (attempt >= 2) {
        throw new LlmError('claude output failed validation after one retry', this.id, formatIssues(parsed.error));
      }
      prompt =
        `${basePrompt}\n\nYour previous answer failed validation:\n${formatIssues(parsed.error)}\n\n` +
        `Previous answer:\n${JSON.stringify(raw)}\n\nReturn a corrected answer.`;
    }
  }

  async agent(task: AgentTask, onEvent?: (event: LlmEvent) => void): Promise<AgentResult> {
    const allow = task.allowCommands ?? [];
    const tools = allow.length ? [...AGENT_TOOLS, 'Bash'] : AGENT_TOOLS;
    const args = [
      '-p',
      ...LOCKDOWN_FLAGS,
      '--tools',
      tools.join(','),
      ...(allow.length ? ['--allowedTools', ...allow.map((cmd) => `Bash(${cmd}:*)`)] : []),
      '--model',
      this.model(task.tier),
      '--output-format',
      'stream-json',
      '--verbose',
      ...(task.resume ? ['--resume', task.resume] : []),
    ];

    let sessionId: string | undefined;
    let final: ClaudeResult | undefined;
    const r = await this.run({
      args,
      cwd: task.cwd,
      stdin: task.prompt,
      timeoutMs: task.timeoutMs ?? AGENT_TIMEOUT_MS,
      signal: task.signal,
      onLine: (line) => {
        const msg = parseJson(line) as StreamMessage | undefined;
        if (!msg) return;
        sessionId ??= msg.session_id;
        if (msg.type === 'result') final = msg;
        for (const event of toEvents(msg)) onEvent?.(event);
      },
    });

    this.assertFinished(r, task.timeoutMs ?? AGENT_TIMEOUT_MS);
    if (!final) throw new LlmError(`claude exited with code ${r.code} without a result`, this.id, tail(r.stderr || r.stdout));
    if (final.is_error || final.subtype !== 'success') {
      throw new LlmError(`claude agent run failed (${final.subtype ?? 'error'})`, this.id, final.result);
    }
    return { sessionId: final.session_id ?? sessionId, text: final.result ?? '' };
  }

  private async runJsonOnce<T>(task: JsonTask<T>, prompt: string): Promise<unknown> {
    const args = [
      '-p',
      ...LOCKDOWN_FLAGS,
      '--tools',
      task.files?.length ? 'Read' : '',
      '--model',
      this.model(task.tier),
      '--json-schema',
      JSON.stringify(toJsonSchema(task.schema)),
      '--output-format',
      'json',
      '--no-session-persistence',
    ];
    const timeoutMs = task.timeoutMs ?? JSON_TIMEOUT_MS;
    const r = await this.run({ args, cwd: task.cwd, stdin: prompt, timeoutMs, signal: task.signal });
    this.assertFinished(r, timeoutMs);

    const out = parseJson(r.stdout.trim()) as ClaudeResult | undefined;
    if (!out) throw new LlmError(`claude exited with code ${r.code} without JSON output`, this.id, tail(r.stderr || r.stdout));
    if (out.is_error || out.subtype !== 'success') {
      throw new LlmError(`claude reported an error (${out.subtype ?? 'error'})`, this.id, out.result);
    }
    if (out.structured_output !== undefined) return out.structured_output;
    return extractJson(out.result ?? '') ?? (await readResultFile(task.cwd));
  }

  private async run(opts: Omit<Parameters<typeof runProcess>[0], 'bin' | 'env'>): Promise<RunResult> {
    try {
      return await runProcess({ ...opts, bin: this.bin, env: childEnv(this.env) });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new LlmError(
          `Claude Code CLI not found ("${this.bin}"). Install it and log in, or choose another backend with AGENTCAST_LLM.`,
          this.id,
        );
      }
      throw err;
    }
  }

  private assertFinished(r: RunResult, timeoutMs: number) {
    if (r.timedOut) throw new LlmError(`claude timed out after ${Math.round(timeoutMs / 1000)}s`, this.id, tail(r.stderr));
    if (r.aborted) throw new LlmError('claude run was cancelled', this.id);
  }
}

function withFileHints(prompt: string, files: string[]): string {
  if (!files.length) return prompt;
  return `${prompt}\n\nInput files (in the current directory, open each with the Read tool):\n${files.map((f) => `- ${f}`).join('\n')}`;
}

function toEvents(msg: StreamMessage): LlmEvent[] {
  if (msg.type === 'result') {
    return msg.is_error || msg.subtype !== 'success'
      ? [{ kind: 'error', text: msg.result ?? msg.subtype ?? 'error' }]
      : [{ kind: 'done', text: msg.result ?? '' }];
  }
  if (msg.type !== 'assistant') return [];
  const events: LlmEvent[] = [];
  for (const block of msg.message?.content ?? []) {
    if (block.type === 'text' && block.text?.trim()) events.push({ kind: 'text', text: block.text.trim() });
    if (block.type === 'tool_use' && block.name) events.push({ kind: 'tool_use', text: describeTool(block.name, block.input) });
  }
  return events;
}

/** "Edit render/edl.json", "Bash npx tsc --noEmit" — short enough for a progress line. */
function describeTool(name: string, input: Record<string, unknown> = {}): string {
  const subject = input.file_path ?? input.command ?? input.pattern ?? input.path;
  const text = typeof subject === 'string' ? `${name} ${subject}` : name;
  return text.length > 200 ? `${text.slice(0, 197)}...` : text;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function tail(text: string, max = 2000): string {
  const t = text.trim();
  return t.length > max ? t.slice(-max) : t;
}
