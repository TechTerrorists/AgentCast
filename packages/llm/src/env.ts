/** Auth for Claude Code itself (`claude setup-token`); stripping it would log the CLI out. */
const ALWAYS_KEEP = new Set(['CLAUDE_CODE_OAUTH_TOKEN']);

/** Anything that looks like a credential. */
const SECRET_NAME = /(API_KEY|_KEY|SECRET|PASSWORD|TOKEN)$/i;

/**
 * Environment for a coding-agent child process: the parent env minus secrets.
 * The agent never sees TinyFish/ElevenLabs keys or our encryption key, and Claude Code
 * uses the subscription login instead of billing a stray ANTHROPIC_API_KEY.
 *
 * Opt-outs: AGENTCAST_CLAUDE_USE_API_KEY=1 keeps ANTHROPIC_API_KEY/ANTHROPIC_AUTH_TOKEN;
 * AGENTCAST_LLM_KEEP_ENV="A,B" keeps extra names (e.g. cloud-provider credentials).
 */
export function childEnv(parent: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const keep = new Set(ALWAYS_KEEP);
  for (const name of (parent.AGENTCAST_LLM_KEEP_ENV ?? '').split(',')) {
    if (name.trim()) keep.add(name.trim());
  }
  if (parent.AGENTCAST_CLAUDE_USE_API_KEY === '1') {
    keep.add('ANTHROPIC_API_KEY');
    keep.add('ANTHROPIC_AUTH_TOKEN');
  }

  const env: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(parent)) {
    if (value === undefined) continue;
    if (SECRET_NAME.test(name) && !keep.has(name)) continue;
    env[name] = value;
  }
  return env;
}
