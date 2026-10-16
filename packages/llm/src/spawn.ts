import { spawn } from 'node:child_process';

export type RunOptions = {
  bin: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  /** Sent on stdin; prompts go here because a single argv string is capped at 128 KB on Linux. */
  stdin?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Called for every complete stdout line, for streaming formats. */
  onLine?: (line: string) => void;
};

export type RunResult = {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  aborted: boolean;
};

const KILL_GRACE_MS = 5_000;

export function runProcess(opts: RunOptions): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(opts.bin, opts.args, { cwd: opts.cwd, env: opts.env, stdio: ['pipe', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    let pending = '';
    let timedOut = false;
    let aborted = false;
    let killTimer: NodeJS.Timeout | undefined;

    const stop = () => {
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS);
      killTimer.unref();
    };

    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          stop();
        }, opts.timeoutMs)
      : undefined;

    const onAbort = () => {
      aborted = true;
      stop();
    };
    opts.signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (!opts.onLine) return;
      pending += chunk;
      let nl: number;
      while ((nl = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, nl).trim();
        pending = pending.slice(nl + 1);
        if (line) opts.onLine(line);
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      opts.signal?.removeEventListener('abort', onAbort);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      opts.signal?.removeEventListener('abort', onAbort);
      if (opts.onLine && pending.trim()) opts.onLine(pending.trim());
      resolve({ code, stdout, stderr, timedOut, aborted });
    });

    // EPIPE if the CLI exits before reading stdin; the close handler reports the real failure.
    child.stdin.on('error', () => {});
    child.stdin.end(opts.stdin ?? '');
  });
}
