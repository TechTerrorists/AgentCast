import { ClaudeCodeBackend } from './backends/claude-code';
import { PlannedAnthropicApiBackend, PlannedCliBackend } from './backends/planned';
import { createLimiter } from './limit';
import type { AgentResult, AgentTask, BackendId, Detection, JsonTask, LlmBackend, LlmEvent, Tier } from './types';

/** `AGENTCAST_LLM=auto` picks the first backend here that is installed and implemented. */
export const AUTO_ORDER: readonly BackendId[] = ['claude-code', 'opencode', 'codex', 'anthropic-api'];

export type Llm = {
  detectAll(): Promise<Detection[]>;
  backendFor(tier: Tier): Promise<LlmBackend>;
  json<T>(task: JsonTask<T>): Promise<T>;
  agent(task: AgentTask, onEvent?: (event: LlmEvent) => void): Promise<AgentResult>;
};

export type CreateLlmOptions = {
  env?: NodeJS.ProcessEnv;
  /** Override for tests. */
  backends?: LlmBackend[];
};

export function defaultBackends(env: NodeJS.ProcessEnv = process.env): LlmBackend[] {
  return [
    new ClaudeCodeBackend({ env }),
    new PlannedCliBackend('opencode', env.AGENTCAST_OPENCODE_BIN ?? 'opencode', env),
    new PlannedCliBackend('codex', env.AGENTCAST_CODEX_BIN ?? 'codex', env),
    new PlannedAnthropicApiBackend(env),
  ];
}

/** The only entry point stages use for LLM work (FR-100). */
export function createLlm(opts: CreateLlmOptions = {}): Llm {
  const env = opts.env ?? process.env;
  const backends = opts.backends ?? defaultBackends(env);
  const byId = new Map(backends.map((b) => [b.id, b] as const));
  const limit = createLimiter(Number(env.AGENTCAST_LLM_CONCURRENCY) || 2);

  let detected: Promise<Map<BackendId, Detection>> | undefined;
  const detectAll = () =>
    (detected ??= Promise.all(backends.map((b) => b.detect())).then((ds) => new Map(ds.map((d) => [d.id, d] as const))));

  async function backendFor(tier: Tier): Promise<LlmBackend> {
    const choice = (tier === 'smart' ? env.AGENTCAST_LLM_SMART : env.AGENTCAST_LLM_FAST) || env.AGENTCAST_LLM || 'auto';
    const found = await detectAll();

    if (choice !== 'auto') {
      const backend = byId.get(choice as BackendId);
      if (!backend) throw new Error(`Unknown LLM backend "${choice}". Use one of: auto, ${AUTO_ORDER.join(', ')}.`);
      const d = found.get(backend.id);
      if (!d?.installed) throw new Error(`LLM backend "${choice}" isn't available${d?.detail ? `: ${d.detail}` : ''}.`);
      if (!d.implemented) throw new Error(`LLM backend "${choice}" is detected but its adapter isn't implemented yet.`);
      return backend;
    }

    for (const id of AUTO_ORDER) {
      const d = found.get(id);
      const backend = byId.get(id);
      if (backend && d?.installed && d.implemented) return backend;
    }
    throw new Error(
      'No usable LLM backend found. Install Claude Code and log in (`claude`), or set AGENTCAST_LLM. ' +
        'Run `pnpm agentcast doctor` for details.',
    );
  }

  return {
    detectAll: async () => [...(await detectAll()).values()],
    backendFor,
    json: (task) => limit(async () => (await backendFor(task.tier)).json(task)),
    agent: (task, onEvent) => limit(async () => (await backendFor(task.tier)).agent(task, onEvent)),
  };
}
