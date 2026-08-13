#!/usr/bin/env node
// bin/loop.js
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from '../src/args.js';
import { preflight } from '../src/preflight.js';
import { run } from '../src/run.js';
import { exitCodeFor } from '../src/exit.js';

// Short path, outside OneDrive and outside AppData (both are rejected by
// assertSafeScratchRoot; AppData is MSIX-redirected under a packaged host).
const DEFAULT_SCRATCH = process.platform === 'win32'
  ? 'C:/ccc/w'
  : join(homedir(), '.ccc', 'w');
const SCRATCH_ROOT = process.env.CCC_SCRATCH_ROOT ?? DEFAULT_SCRATCH;

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`arg error: ${e.message}\n`);
    process.exit(2);
  }
  const pf = await preflight({ target: opts.target, gate: opts.gate, scratchRoot: SCRATCH_ROOT });
  if (!pf.ok) {
    process.stderr.write(`preflight failed: ${pf.reason}\n`);
    process.exit(2);
  }
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const facts = await run({ ...opts, scratchRoot: SCRATCH_ROOT, runId });
  process.stdout.write(JSON.stringify(facts, null, 2) + '\n');
  process.exit(exitCodeFor(facts.outcome));
}

main().catch((e) => { process.stderr.write(`fatal: ${e.stack}\n`); process.exit(3); });
