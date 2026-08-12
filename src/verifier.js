import { spawnCapture } from './spawn.js';

const FORBIDDEN = ['--force', '--yolo', '-f', '--approve-mcps'];

export function assertNoForbiddenFlags(args) {
  for (const f of FORBIDDEN) {
    if (args.includes(f)) throw new Error(`forbidden verifier flag: ${f}`);
  }
}

const DEFAULT_PROMPT = 'Read the file CHANGES.diff in the current directory and review that change for correctness and obvious bugs. If there are no blocking problems, make your final line exactly NO_BLOCKERS. Otherwise briefly list the problems and make your final line exactly ISSUES.';

export function assertUsablePrompt(prompt) {
  if (prompt.includes('"')) throw new Error('verifier prompt must not contain a double quote');
  if (/[\r\n]/.test(prompt)) throw new Error('verifier prompt must be a single line');
  if (prompt.trim() === '') throw new Error('verifier prompt must not be empty');
}

export function buildCursorArgs({ model = 'cursor-grok-4.5-high', prompt = DEFAULT_PROMPT } = {}) {
  assertUsablePrompt(prompt);
  // --trust clears Cursor's "Workspace Trust Required" gate for READING the checkout; without
  // it the agent exits 1 with no output and every review defaults to fail-safe ISSUES. It is
  // NOT one of the forbidden flags (--force/--yolo/-f/--approve-mcps auto-APPROVE actions);
  // --mode plan keeps the agent read-only regardless. Verified live (exit 0, NO_BLOCKERS).
  const args = ['-p', prompt, '--output-format', 'stream-json', '--mode', 'plan', '--trust', '--model', model];
  assertNoForbiddenFlags(args);
  return args;
}

export function parseVerdict(streamText) {
  let resultText = null;
  let lastAssistant = '';
  for (const line of streamText.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    let item;
    try { item = JSON.parse(s); } catch { continue; }
    if (item.type === 'assistant' && item.message && Array.isArray(item.message.content)) {
      for (const part of item.message.content) {
        if (part && part.type === 'text' && typeof part.text === 'string') lastAssistant = part.text;
      }
    } else if (item.type === 'result' && typeof item.result === 'string') {
      resultText = item.is_error ? '' : item.result; // an errored result yields no verdict text
    }
  }
  const text = resultText ?? lastAssistant;
  return /NO_BLOCKERS/.test(text) ? 'NO_BLOCKERS' : 'ISSUES';
}

export function hasVerdictEvidence(streamText) {
  for (const line of streamText.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    let item;
    try { item = JSON.parse(s); } catch { continue; }
    if (item.type === 'result' || item.type === 'assistant') return true;
  }
  return false;
}

export async function runVerifier({ cwd, bin = 'agent', prompt = DEFAULT_PROMPT, extraArgv = [] }) {
  const args = [...extraArgv, ...buildCursorArgs({ prompt })];
  const r = await spawnCapture(bin, args, { cwd });
  const verdict = parseVerdict(r.stdout);
  const exitCode = r.code;
  const launchFailed = exitCode !== 0 && !hasVerdictEvidence(r.stdout);
  return launchFailed
    ? { verdict, exitCode, launchFailed, stderr: r.stderr.slice(0, 500) }
    : { verdict, exitCode, launchFailed };
}
