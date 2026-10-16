#!/usr/bin/env -S npx tsx
import { existsSync } from 'node:fs';
import { doctor } from './doctor';

const USAGE = `Usage: agentcast <command>

Commands:
  doctor [--probe]   Check tools, API keys and the LLM backend (--probe makes one tiny LLM call)
`;

async function main(argv: string[]): Promise<number> {
  if (existsSync('.env')) process.loadEnvFile('.env');

  const [command, ...rest] = argv;
  switch (command) {
    case 'doctor':
      return doctor({ probe: rest.includes('--probe') });
    case undefined:
    case '-h':
    case '--help':
      console.log(USAGE);
      return 0;
    default:
      console.error(`Unknown command: ${command}\n\n${USAGE}`);
      return 2;
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
