import { spawnCapture } from './spawn.js';

export async function runGate({ commands, cwd }) {
  const results = [];
  for (const cmd of commands) {
    const r = await spawnCapture(cmd.bin, cmd.args, { cwd });
    results.push({ bin: cmd.bin, args: cmd.args, code: r.code });
    if (r.code !== 0) return { passed: false, results };
  }
  return { passed: true, results };
}
