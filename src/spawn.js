import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

// Resolve a bare command name to a full path via `where` (win) / `which` (posix).
// A bin that already carries a path separator is returned as-is when it exists.
// Returns null when it cannot be resolved.
function resolveBin(bin) {
  if (bin.includes('/') || bin.includes('\\')) {
    return Promise.resolve(existsSync(bin) ? bin : null);
  }
  const probe = process.platform === 'win32' ? 'where' : 'which';
  return new Promise((res) => {
    const c = spawn(probe, [bin], { windowsHide: true });
    let out = '';
    c.stdout.on('data', (d) => { out += d; });
    c.on('error', () => res(null));
    c.on('close', (code) => {
      if (code !== 0) return res(null);
      const lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (process.platform === 'win32') {
        // `where` may list an extensionless shim (e.g. npm's `codex`) BEFORE the runnable
        // `codex.cmd`; prefer a PATHEXT-executable variant Windows can actually launch.
        const exe = lines.find((l) => /\.(exe|cmd|bat|com)$/i.test(l));
        return res(exe || lines[0] || null);
      }
      return res(lines[0] || null);
    });
  });
}

// Quote a token for a cmd.exe command line: wrap in double quotes if it holds
// whitespace or a quote (doubling any internal quote); empty string -> "".
function quoteWin(s) {
  if (s === '') return '""';
  if (/[\s"]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export async function spawnCapture(bin, args, opts = {}) {
  let cmd = bin;
  let cmdArgs = args;
  let verbatim = false;
  if (process.platform === 'win32') {
    const resolved = await resolveBin(bin);
    if (resolved && /\.(cmd|bat)$/i.test(resolved)) {
      // Node cannot exec .cmd/.bat directly (CVE-2024-27980), and `shell:true`
      // RE-SPLITS args (`a b c` -> three args). Spawn cmd.exe (an .exe) directly and
      // build the command line ourselves with windowsVerbatimArguments: wrap the WHOLE
      // command in one extra outer quote pair so `cmd /s` strips exactly that pair,
      // leaving a correctly-quoted "path" + args — this survives spaces in the path
      // (e.g. the OneDrive package path), which a plain quoted `cmd /c "x" "a b"` mangles.
      // (Known cmd limit: a .cmd reading an `=`-bearing arg via %~1 splits on `=`; our
      // .cmd targets carry no `=` args — the only `=` argv, codex `mcp_servers={}`, goes
      // to codex.exe, spawned directly.)
      cmd = process.env.ComSpec || 'cmd.exe';
      const line = '"' + [resolved, ...args].map(quoteWin).join(' ') + '"';
      cmdArgs = ['/d', '/s', '/c', line];
      verbatim = true;
    } else if (resolved) {
      cmd = resolved;
    }
  }
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      windowsHide: true,
      windowsVerbatimArguments: verbatim,
    });
    const outChunks = [];
    const errChunks = [];
    child.stdout.on('data', (d) => outChunks.push(d));
    child.stderr.on('data', (d) => errChunks.push(d));
    child.on('error', reject);
    child.on('close', (code) => resolve({
      code: code ?? -1,
      stdout: Buffer.concat(outChunks).toString('utf8'),
      stderr: Buffer.concat(errChunks).toString('utf8'),
    }));
    if (opts.input !== undefined) child.stdin.end(opts.input);
    else child.stdin.end();
  });
}

export async function commandExists(bin) {
  if (bin.includes('/') || bin.includes('\\')) return existsSync(bin);
  const probe = process.platform === 'win32' ? 'where' : 'which';
  try {
    const r = await spawnCapture(probe, [bin]);
    return r.code === 0;
  } catch {
    return false;
  }
}
