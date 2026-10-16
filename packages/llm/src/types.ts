import type { z } from 'zod';

/** smart: director, script writer. fast: brief, flow judge, locator healing. */
export type Tier = 'smart' | 'fast';

export type BackendId = 'claude-code' | 'opencode' | 'codex' | 'anthropic-api';

/** Backend-neutral progress event, mapped from each CLI's own output format. */
export type LlmEvent =
  | { kind: 'text'; text: string }
  | { kind: 'tool_use'; text: string }
  | { kind: 'done'; text: string }
  | { kind: 'error'; text: string };

export type JsonTask<T> = {
  prompt: string;
  schema: z.ZodType<T>;
  tier: Tier;
  /** Task directory. Input files live here and the agent may only touch files inside it. */
  cwd: string;
  /** Paths, relative to cwd, the agent should open (screenshots, ARIA snapshots). Enables read access. */
  files?: string[];
  timeoutMs?: number;
  signal?: AbortSignal;
};

export type AgentTask = {
  prompt: string;
  tier: Tier;
  /** Workspace the agent edits. */
  cwd: string;
  /** Command prefixes the agent may run, e.g. "npx tsc --noEmit". Anything else is denied. */
  allowCommands?: string[];
  timeoutMs?: number;
  /** Session id from a previous run, to continue with its context (revise loop). */
  resume?: string;
  signal?: AbortSignal;
};

export type AgentResult = {
  sessionId: string | undefined;
  /** Final message from the agent. */
  text: string;
};

export type Detection = {
  id: BackendId;
  installed: boolean;
  /** False for backends whose adapter isn't written yet. */
  implemented: boolean;
  version?: string;
  detail?: string;
};

export interface LlmBackend {
  readonly id: BackendId;
  detect(): Promise<Detection>;
  json<T>(task: JsonTask<T>): Promise<T>;
  agent(task: AgentTask, onEvent?: (event: LlmEvent) => void): Promise<AgentResult>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly backend: BackendId,
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}
