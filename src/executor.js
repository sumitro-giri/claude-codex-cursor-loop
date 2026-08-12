import { spawnCapture } from './spawn.js';

export function buildCodexArgs({ cwd, model = 'gpt-5.6-sol', effort = 'xhigh' }) {
  return [
    'exec', '--json',
    '-m', model,
    '-c', `model_reasoning_effort=${effort}`,
    '-c', 'mcp_servers={}',
    '-s', 'workspace-write',
    '-C', cwd,
    '-',
  ];
}

export function parseCodexStream(streamText) {
  const seen = new Set();
  const changedFiles = [];
  let lastMessage = '';
  for (const line of streamText.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    let o;
    try { o = JSON.parse(s); } catch { continue; }
    if (o.type !== 'item.completed' || !o.item) continue;
    const it = o.item;
    if (it.type === 'file_change' && Array.isArray(it.changes)) {
      for (const c of it.changes) {
        if (c && typeof c.path === 'string' && !seen.has(c.path)) { seen.add(c.path); changedFiles.push(c.path); }
      }
    } else if (it.type === 'agent_message' && typeof it.text === 'string') {
      lastMessage = it.text;
    }
  }
  return { changedFiles, lastMessage };
}

export async function runExecutor({ plan, cwd, bin = 'codex', extraArgv = [] }) {
  const args = [...extraArgv, ...buildCodexArgs({ cwd })];
  const r = await spawnCapture(bin, args, { cwd, input: plan });
  return parseCodexStream(r.stdout);
}
