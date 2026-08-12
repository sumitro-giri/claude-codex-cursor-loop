import { parseArgs as nodeParseArgs } from 'node:util';

export function parseArgs(argv) {
  const command = argv[0];
  if (command !== 'run') throw new Error(`unknown command: ${command ?? '(none)'}`);
  const { values } = nodeParseArgs({
    args: argv.slice(1),
    options: {
      task: { type: 'string' },
      target: { type: 'string' },
      gate: { type: 'string' },
      'max-iterations': { type: 'string' },
      'gate-retries': { type: 'string' },
    },
    strict: true,
  });
  for (const req of ['task', 'target', 'gate']) {
    if (!values[req]) throw new Error(`missing required option: --${req}`);
  }
  const clampInt = (v, def, lo, hi) => {
    if (v === undefined) return def;
    const n = Number.parseInt(v, 10);
    if (!Number.isInteger(n) || n < lo || n > hi) {
      throw new Error(`value out of range [${lo}-${hi}]: ${v}`);
    }
    return n;
  };
  return {
    command,
    task: values.task,
    target: values.target,
    gate: values.gate,
    maxIterations: clampInt(values['max-iterations'], 3, 1, 10),
    gateRetries: clampInt(values['gate-retries'], 2, 0, 3),
  };
}
