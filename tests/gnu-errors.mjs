// Compares the simulator's error text with real bash + GNU coreutils/findutils on this machine.
// Run from the repo root:  deno run --allow-read --allow-write --allow-run tests/gnu-errors.mjs
// Each case runs twice: in shell.js on a virtual home, and in `bash -c` (LC_ALL=C) on a real temp folder with the
// same files. stderr must match line for line (bash's "-c: line 1:" prefix and its echo of the line are dropped).
import { Shell } from '../static/js/shell.js';
import { baseFS, HOME } from '../static/js/vfs.js';

const FILES = { 'a.txt': 'b\na\nc\n10\n2', 'notes.txt': 'hello\nworld', 'd/inner.txt': 'x', 'd/sub/deep.txt': 'y', 'e/': null, 'my notes.txt': 'z' };

const CASES = [
  // cat / ls / cd
  'cat nope', 'cat d', 'cat d/inner.txt/x', 'cat /etc/shadow', 'cat /root/notes.txt',
  'ls nope', 'ls -z', 'ls --bogus', 'ls /root',
  'cd nope', 'cd a.txt', 'cd a.txt/x', 'cd d e', 'cd /root',
  // mkdir
  'mkdir', 'mkdir d', 'mkdir x/y', 'mkdir a.txt/b', 'mkdir -p a.txt/b', 'mkdir -p d/inner.txt/x/y', 'mkdir /etc/x', 'mkdir -z x',
  // cp / mv
  'cp', 'cp a.txt', 'cp nope e', 'cp d e', 'cp a.txt a.txt', 'cp a.txt nope/x', 'cp a.txt nope/', 'cp a.txt d/inner.txt/x',
  'cp a.txt d/inner.txt/', 'cp a.txt notes.txt nope', 'cp a.txt /etc/', 'cp /etc/shadow .', 'cp -r d d/sub', 'cp -r d a.txt', 'cp a.txt d/sub/../..',
  'mv', 'mv a.txt', 'mv nope e', 'mv a.txt nope/x', 'mv a.txt nope/', 'mv a.txt d/inner.txt/x', 'mv a.txt d/inner.txt/', 'mv d d/sub',
  'mv a.txt /etc/', 'mv /etc/passwd .', 'mv a.txt a.txt',
  // rm / rmdir / touch
  'rm', 'rm nope', 'rm d', 'rm -z a.txt', 'rm /etc/passwd', 'rm -f nope',
  'rmdir', 'rmdir d', 'rmdir nope', 'rmdir a.txt', 'touch', 'touch nope/x', 'touch /etc/x',
  // redirection
  'echo hi > /etc/passwd', 'echo hi > /etc/hostname', 'echo hi > d', 'echo hi > nope/x', 'cat < nope',
  // head / tail / sort / wc / grep
  'head nope', 'head d', 'head -n', 'head -n x a.txt', 'tail nope', 'tail -x a.txt', 'sort nope', 'sort d', 'wc nope', 'wc d',
  'grep', 'grep x nope', 'grep x d',
  // find
  'find nope', 'find . -bogus', 'find . -name', 'find /root', 'find . -name *.txt',
  // syntax
  'ls ;;', 'ls | ;', '; ls', 'ls >', 'echo "abc', "echo 'abc", '| ls',
  // unknown commands / sudo-less poweroff
  'lss', 'LS', 'ls-la',
];

function realRun(dir, cmd) {
  const p = new Deno.Command('bash', { args: ['-c', cmd], cwd: dir, env: { LC_ALL: 'C', PATH: '/usr/bin:/bin' }, stdout: 'null', stderr: 'piped', stdin: 'null' });
  const out = p.outputSync();
  return new TextDecoder().decode(out.stderr).split('\n').filter(Boolean)
    .filter(l => !/^(\/usr)?(\/bin\/)?bash: (-c: )?line \d+: `/.test(l))
    .map(l => l.replace(/^(\/usr)?(\/bin\/)?bash: (-c: )?line \d+: /, 'bash: '));
}

async function simRun(cmd) {
  const fs = baseFS();
  const spec = {};
  for (const [k, v] of Object.entries(FILES)) {
    if (v === null) { spec[k] = {}; continue; }
    const parts = k.split('/');
    let at = spec;
    for (const d of parts.slice(0, -1)) at = at[d + '/'] ??= {};
    at[parts[parts.length - 1]] = v;
  }
  fs.tree(HOME, spec);
  let err = '';
  const io = { write: (kind, t) => { if (kind === 'err') err += t; }, clear() {}, prompt: async () => null };
  await new Shell(fs, io).exec(cmd);
  return err.split('\n').filter(Boolean).map(l => l.replace(/\x1b\[[0-9;]*m/g, ''));
}

const dir = Deno.makeTempDirSync({ dir: '/var/tmp', prefix: 'lamshell-gnu-' })   // same disk as /etc: mv there is a rename, like on the game's one-disk machine;
let same = 0;
const diff = [];
for (const cmd of CASES) {
  Deno.removeSync(dir, { recursive: true }); Deno.mkdirSync(dir);
  for (const [k, v] of Object.entries(FILES)) {
    const p = `${dir}/${k}`;
    Deno.mkdirSync(p.slice(0, p.lastIndexOf('/')), { recursive: true });
    if (v === null) Deno.mkdirSync(p, { recursive: true }); else Deno.writeTextFileSync(p, v + '\n');
  }
  const real = realRun(dir, cmd), sim = await simRun(cmd);
  if (real.join('\n') === sim.join('\n')) same++;
  else diff.push({ cmd, real, sim });
}
Deno.removeSync(dir, { recursive: true });
for (const d of diff) console.log(`✗ ${d.cmd}\n    real: ${d.real.join(' ⏎ ') || '(nothing)'}\n    game: ${d.sim.join(' ⏎ ') || '(nothing)'}`);
const ver = new TextDecoder().decode(new Deno.Command('bash', { args: ['-c', 'ls --version | head -1; bash --version | head -1; find --version | head -1'] }).outputSync().stdout).trim().split('\n').join(' / ');
console.log(`\n${same}/${CASES.length} error cases match real bash/coreutils (${ver})`);
