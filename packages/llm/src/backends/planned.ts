import { childEnv } from '../env';
import { runProcess } from '../spawn';
import { LlmError, type AgentResult, type BackendId, type Detection, type LlmBackend } from '../types';

/**
 * Backends that are detected (so `doctor` can report them) but whose adapters aren't written yet.
 * opencode is planned for Phase 8, codex once someone can test it (IMPLEMENTATION_PLAN.md).
 */
export class PlannedCliBackend implements LlmBackend {
  constructor(
    readonly id: Exclude<BackendId, 'claude-code' | 'anthropic-api'>,
    private readonly bin: string,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  async detect(): Promise<Detection> {
    try {
      const r = await runProcess({ bin: this.bin, args: ['--version'], cwd: process.cwd(), env: childEnv(this.env), timeoutMs: 15_000 });
      if (r.code !== 0) return { id: this.id, installed: false, implemented: false };
      return { id: this.id, installed: true, implemented: false, version: r.stdout.trim().split('\n')[0] };
    } catch {
      return { id: this.id, installed: false, implemented: false };
    }
  }

  json<T>(): Promise<T> {
    return Promise.reject(this.notYet());
  }

  agent(): Promise<AgentResult> {
    return Promise.reject(this.notYet());
  }

  private notYet() {
    return new LlmError(`The ${this.id} adapter isn't implemented yet. Use AGENTCAST_LLM=claude-code for now.`, this.id);
  }
}

/** Optional direct API backend (FR-103, P2). Detected when ANTHROPIC_API_KEY is set. */
export class PlannedAnthropicApiBackend implements LlmBackend {
  readonly id = 'anthropic-api' as const;

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  async detect(): Promise<Detection> {
    const installed = Boolean(this.env.ANTHROPIC_API_KEY);
    return { id: this.id, installed, implemented: false, ...(installed ? {} : { detail: 'ANTHROPIC_API_KEY not set' }) };
  }

  json<T>(): Promise<T> {
    return Promise.reject(new LlmError("The anthropic-api adapter isn't implemented yet.", this.id));
  }

  agent(): Promise<AgentResult> {
    return Promise.reject(new LlmError("The anthropic-api adapter isn't implemented yet.", this.id));
  }
}
