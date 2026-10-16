#!/usr/bin/env node
// Stand-in for the `claude` CLI in tests. Behaviour is picked by FAKE_SCENARIO; every call is
// appended to FAKE_LOG so tests can assert on argv, stdin and the environment it received.
import { appendFileSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
if (args[0] === '--version') {
  console.log('9.9.9 (Claude Code)');
  process.exit(0);
}

const stdin = readFileSync(0, 'utf8');
const log = process.env.FAKE_LOG;
if (log) {
  appendFileSync(
    log,
    JSON.stringify({
      args,
      stdin,
      cwd: process.cwd(),
      hasTinyfishKey: 'TINYFISH_API_KEY' in process.env,
      hasAnthropicKey: 'ANTHROPIC_API_KEY' in process.env,
      hasOauthToken: 'CLAUDE_CODE_OAUTH_TOKEN' in process.env,
    }) + '\n',
  );
}
const callNumber = log ? readFileSync(log, 'utf8').trim().split('\n').length : 1;
const print = (msg) => console.log(JSON.stringify(msg));
const success = (extra) => print({ type: 'result', subtype: 'success', is_error: false, session_id: 'sess-1', result: '', ...extra });

switch (process.env.FAKE_SCENARIO) {
  case 'json-ok':
    success({ structured_output: { score: 4, why: 'clear payoff' } });
    break;
  case 'json-invalid-then-ok':
    success({ structured_output: callNumber === 1 ? { score: 99, why: 'too high' } : { score: 5, why: 'fixed' } });
    break;
  case 'json-invalid-always':
    success({ structured_output: { score: 99, why: 'still too high' } });
    break;
  case 'json-text-only':
    success({ result: 'Sure:\n```json\n{"score":2,"why":"from text"}\n```' });
    break;
  case 'json-error':
    print({ type: 'result', subtype: 'error_during_execution', is_error: true, session_id: 'sess-1', result: 'usage limit reached' });
    process.exit(1);
    break;
  case 'hang':
    setInterval(() => {}, 1000);
    break;
  case 'agent-ok':
    for (const msg of [
      { type: 'system', subtype: 'init', session_id: 'sess-agent' },
      { type: 'assistant', session_id: 'sess-agent', message: { content: [{ type: 'text', text: 'Reading DIRECTOR.md' }] } },
      { type: 'assistant', session_id: 'sess-agent', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'edl.json' } }] } },
      { type: 'user', session_id: 'sess-agent', message: { content: [{ type: 'tool_result', content: 'ok' }] } },
      { type: 'result', subtype: 'success', is_error: false, session_id: 'sess-agent', result: 'EDL written' },
    ]) {
      print(msg);
    }
    break;
  default:
    console.error(`unknown FAKE_SCENARIO: ${process.env.FAKE_SCENARIO}`);
    process.exit(2);
}
