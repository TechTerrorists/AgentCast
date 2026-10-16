import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

/** File-contract fallback: the agent may write its answer here instead of returning it (PRD §9.9). */
export const RESULT_FILE = 'result.json';

/** JSON Schema handed to CLIs with native structured output. Refinements are enforced by zod afterwards. */
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { unrepresentable: 'any' }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

/** Pulls the first JSON object or array out of free text (fenced or bare). */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidates = [fenced?.[1], text];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const start = candidate.search(/[[{]/);
    if (start === -1) continue;
    const open = candidate[start];
    const close = open === '{' ? '}' : ']';
    const end = candidate.lastIndexOf(close);
    if (end <= start) continue;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      // try the next candidate
    }
  }
  return undefined;
}

export async function readResultFile(cwd: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(join(cwd, RESULT_FILE), 'utf8'));
  } catch {
    return undefined;
  }
}

export function formatIssues(error: z.ZodError): string {
  return error.issues.map((i) => `- ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
}
