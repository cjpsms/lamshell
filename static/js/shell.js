// Simulated bash. Error messages copy GNU coreutils 9.4 / bash 5.2 / findutils 4.9 wording.
import { HOME, basename, dirname, normalize, sizeOf, canRead, canWriteDir, canWriteFile } from './vfs.js';
import { MAN } from './man.js';

export const CORE = ['ls', 'cd', 'mkdir', 'cp', 'mv', 'rm', 'cat', 'find', 'sudo', 'poweroff'];
const BUILTINS = new Set(['cd', 'pwd', 'echo', 'exit', 'help', 'clear', 'history']);

const C = { dir: '\x1b[1;34m', red: '\x1b[1;31m', off: '\x1b[0m' };

// GNU quoting: the "always" style used by ls/cp/mv/rm/mkdir, and the "only if needed" style of cat/wc/grep.
const qa = s => (s.includes("'") ? `"${s}"` : `'${s}'`);
const qn = s => (/[\s'"\\$`*?\[\]{}()<>|&;!#~]/.test(s) ? qa(s) : s);

class SyntaxErr extends Error {}

// ---------- tokenizer / parser ----------

function tokenize(line, vars) {
  const toks = [];
  const n = line.length;
  let i = 0;
  const expandVars = s => s.replace(/\$(\?|[A-Za-z_]\w*)/g, (_, v) => vars[v] ?? '');
  while (i < n) {
    const c = line[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (c === '|') { if (line[i + 1] === '|') { toks.push({ op: '||' }); i += 2; } else { toks.push({ op: '|' }); i++; } continue; }
    if (c === '&') {
      if (line[i + 1] === '&') { toks.push({ op: '&&' }); i += 2; continue; }
      if (line[i + 1] === '>') { const app = line[i + 2] === '>'; toks.push({ op: 'redir', fd: 'both', app }); i += app ? 3 : 2; continue; }
      toks.push({ op: '&' }); i++; continue;
    }
    if (c === ';') { toks.push({ op: ';' }); i++; continue; }
    if (c === '<') { toks.push({ op: '<' }); i++; continue; }
    if (c === '>' || (c === '2' && line[i + 1] === '>')) {
      let fd = 1;
      if (c === '2') { fd = 2; i++; }
      i++;
      let app = false;
      if (line[i] === '>') { app = true; i++; }
      if (fd === 2 && line[i] === '&' && line[i + 1] === '1') { toks.push({ op: '2>&1' }); i += 2; continue; }
      toks.push({ op: 'redir', fd, app });
      continue;
    }
    let v = '', quoted = false, glob = false, tilde = false, start = true;
    while (i < n) {
      const d = line[i];
      if (' \t|&;<>'.includes(d)) break;
      if (d === "'") {
        const j = line.indexOf("'", i + 1);
        if (j < 0) throw new SyntaxErr("unexpected EOF while looking for matching `''");
        v += line.slice(i + 1, j); quoted = true; i = j + 1; start = false; continue;
      }
      if (d === '"') {
        let j = i + 1, s = '';
        while (j < n && line[j] !== '"') {
          if (line[j] === '\\' && j + 1 < n && '"\\$`'.includes(line[j + 1])) { s += line[j + 1]; j += 2; } else { s += line[j]; j++; }
        }
        if (j >= n) throw new SyntaxErr('unexpected EOF while looking for matching `"\'');
        v += expandVars(s); quoted = true; i = j + 1; start = false; continue;
      }
      if (d === '\\') { if (i + 1 < n) { v += line[i + 1]; quoted = true; i += 2; } else i++; start = false; continue; }
      if (d === '$') {
        const m = /^\$(\?|[A-Za-z_]\w*)/.exec(line.slice(i));
        if (m) { v += vars[m[1]] ?? ''; i += m[0].length; start = false; continue; }
      }
      if (start && d === '~') tilde = true;
      if ('*?['.includes(d)) glob = true;
      v += d; i++; start = false;
    }
    toks.push({ w: v, quoted, glob, tilde });
  }
  return toks;
}

// -> [{ sep, pipe: [{ words, redirs }] }]
function parse(toks) {
  const list = [];
  let pipe = [], cmd = { words: [], redirs: [] }, sep = null;
  const bad = t => { throw new SyntaxErr(`syntax error near unexpected token \`${t}'`); };
  const endCmd = opTok => {
    if (!cmd.words.length && !cmd.redirs.length) bad(opTok);
    pipe.push(cmd); cmd = { words: [], redirs: [] };
  };
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (t.w !== undefined) { cmd.words.push(t); continue; }
    if (t.op === 'redir' || t.op === '<') {
      const nx = toks[k + 1];
      if (!nx || nx.w === undefined) bad(nx ? nx.op : 'newline');
      cmd.redirs.push({ fd: t.op === '<' ? 0 : t.fd, app: t.app, target: nx }); k++; continue;
    }
    if (t.op === '2>&1') { cmd.redirs.push({ fd: 2, dup: true }); continue; }
    if (t.op === '|') { endCmd('|'); continue; }
    if (['&&', '||', ';', '&'].includes(t.op)) {
      endCmd(t.op);
      list.push({ sep, pipe }); pipe = []; sep = t.op; continue;
    }
  }
  if (cmd.words.length || cmd.redirs.length) pipe.push(cmd);
  else if (pipe.length) bad('newline');
  if (pipe.length) list.push({ sep, pipe });
  return list;
}

export function globToRe(p, icase = false) {
  let re = '';
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '*') re += '.*';
    else if (c === '?') re += '.';
    else if (c === '[') {
      const j = p.indexOf(']', i + 1);
      if (j < 0) { re += '\\['; continue; }
      let body = p.slice(i + 1, j);
      if (body.startsWith('!')) body = '^' + body.slice(1);
      re += '[' + body.replace(/\\/g, '\\\\') + ']';
      i = j;
    } else re += c.replace(/[.+^${}()|\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$', icase ? 'i' : '');
}

// GNU ls sorts in en_US locale: case-insensitive, ignoring leading dots/underscores.
const lsKey = s => s.replace(/^[._]+/, '').toLowerCase();
const lsSort = arr => arr.sort((a, b) => lsKey(a).localeCompare(lsKey(b)) || a.localeCompare(b));

// ---------- shell ----------

export class Shell {
  // io: { prompt(text, {hidden}) -> Promise<string|null>, clear(), write(kind, text) }
  constructor(fs, io, opts = {}) {
    this.fs = fs;
    this.io = io;
    this.cwd = opts.cwd || HOME;
    this.oldpwd = this.cwd;
    this.password = opts.password || 'pass123';
    this.sudoAuth = false;
    this.lastCode = 0;
    this.flags = {};          // poweroff, wiped, ...
    this.trace = [];          // every simple command run: { name, args, sudo, code }
  }

  pretty(abs = this.cwd) {
    if (abs === HOME) return '~';
    if (abs.startsWith(HOME + '/')) return '~' + abs.slice(HOME.length);
    return abs;
  }
  abs(p) { return this.fs.resolve(this.cwd, p); }
  join(disp, name) { return disp === '/' ? '/' + name : disp.replace(/\/+$/, '') + '/' + name; }

  // Run one input line. Returns { code, stdout, stderr, cmds }, where stdout/stderr are what reached the screen.
  async exec(line) {
    const res = { code: 0, stdout: '', stderr: '', cmds: [], line };
    this.cur = res;
    const traceStart = this.trace.length;
    let list;
    try {
      list = parse(tokenize(line, { HOME, USER: 'student', PWD: this.cwd, '?': String(this.lastCode) }));
    } catch (e) {
      if (!(e instanceof SyntaxErr)) throw e;
      this.screenErr(`bash: ${e.message}\n`);
      res.code = this.lastCode = 2;
      return res;
    }
    let code = 0;
    for (const { sep, pipe } of list) {
      if (sep === '&&' && code !== 0) continue;
      if (sep === '||' && code === 0) continue;
      code = await this.runPipeline(pipe);
      this.lastCode = code;
    }
    res.code = code;
    res.cmds = this.trace.slice(traceStart);
    this.fixCwd();
    return res;
  }

  screenOut(s) { if (!s) return; this.cur.stdout += s; this.io.write('out', s); }
  screenErr(s) { if (!s) return; this.cur.stderr += s; this.io.write('err', s); }

  // If the cwd was deleted or moved away, fall back to the nearest existing ancestor.
  fixCwd() {
    let p = this.cwd;
    while (p !== '/' && !this.fs.isDir(p)) p = dirname(p);
    this.cwd = p;
  }

  expand(words) {
    const out = [];
    for (const t of words) {
      let w = t.w;
      if (t.tilde && (w === '~' || w.startsWith('~/'))) w = HOME + w.slice(1);
      if (t.glob) {
        const m = this.glob(w);
        if (m.length) { out.push(...m); continue; }
      }
      out.push(w);
    }
    return out;
  }

  glob(pat) {
    const slash = pat.lastIndexOf('/');
    const dirPart = slash >= 0 ? pat.slice(0, slash + 1) : '';
    const last = pat.slice(slash + 1);
    if (/[*?[]/.test(dirPart)) return [];
    const dir = this.fs.lookup(this.abs(dirPart || '.'), false).node;
    if (!dir || dir.t !== 'd' || dir.priv) return [];
    const re = globToRe(last);
    const names = Object.keys(dir.kids).filter(k => re.test(k) && (!k.startsWith('.') || last.startsWith('.')));
    return lsSort(names).map(k => dirPart + k);
  }

  // Open a file for writing via redirection. Returns a sink function or null (error already printed).
  openRedirect(target, app) {
    if (target === '/dev/null') return () => {};
    const abs = this.abs(target);
    const r = this.fs.lookup(abs, false);
    if (r.err === 'EACCES') { this.screenErr(`bash: ${target}: Permission denied\n`); return null; }
    if (r.err === 'ENOTDIR' || (r.err === 'ENOENT' && !r.parentOk)) { this.screenErr(`bash: ${target}: No such file or directory\n`); return null; }
    const parent = r.parent;
    if (r.node) {
      if (r.node.t === 'd') { this.screenErr(`bash: ${target}: Is a directory\n`); return null; }
      if (!canWriteFile(r.node, false)) { this.screenErr(`bash: ${target}: Permission denied\n`); return null; }
      if (!app) { r.node.content = ''; delete r.node.size; }
      const node = r.node;
      return s => { node.content += s; };
    }
    if (!canWriteDir(parent, false)) { this.screenErr(`bash: ${target}: Permission denied\n`); return null; }
    const node = { t: 'f', priv: false, content: '' };
    parent.kids[r.name] = node;
    return s => { node.content += s; };
  }

  async runPipeline(pipe) {
    let stdin = null, code = 0;
    for (let k = 0; k < pipe.length; k++) {
      const cmd = pipe[k];
      const last = k === pipe.length - 1;
      const outBuf = [];
      let outSink = null, errSink = s => this.screenErr(s), failed = false;
      let cmdStdin = stdin;
      for (const r of cmd.redirs) {
        if (r.dup) { errSink = outSink || (last ? s => this.screenOut(s) : s => outBuf.push(s)); continue; }
        const target = this.expand([r.target])[0];
        if (r.fd === 0) {
          const f = this.fs.lookup(this.abs(target), false);
          if (!f.node) { this.screenErr(`bash: ${target}: No such file or directory\n`); failed = true; break; }
          if (f.node.t === 'd') { this.screenErr(`bash: ${target}: Is a directory\n`); failed = true; break; }
          if (!canRead(f.node, false)) { this.screenErr(`bash: ${target}: Permission denied\n`); failed = true; break; }
          cmdStdin = f.node.content; continue;
        }
        const sink = this.openRedirect(target, r.app);
        if (!sink) { failed = true; break; }
        if (r.fd === 1) outSink = sink;
        else if (r.fd === 2) errSink = sink;
        else { outSink = sink; errSink = sink; }
      }
      if (failed) { code = 1; stdin = ''; continue; }
      const words = this.expand(cmd.words);
      const ctx = {
        stdin: cmdStdin,
        isTTY: last && !outSink,
        sudo: false,
        out: s => (outSink ? outSink(s) : outBuf.push(s)),
        err: s => errSink(s),
      };
      code = words.length ? await this.runCommand(words, ctx) : 0;
      const out = outBuf.join('');
      if (outSink) stdin = '';
      else if (last) this.screenOut(out);
      else stdin = out;
    }
    return code;
  }

  async runCommand(words, ctx) {
    const [name, ...args] = words;
    const fn = this.cmds[name];
    let code;
    if (!fn) {
      if (name.includes('/')) {
        const n = this.fs.get(this.abs(name));
        ctx.err(n ? `bash: ${name}: Permission denied\n` : `bash: ${name}: No such file or directory\n`);
        code = n ? 126 : 127;
      } else {
        ctx.err(`bash: ${name}: command not found\n`);
        code = 127;
      }
    } else {
      code = await fn.call(this, args, ctx);
    }
    this.trace.push({ name, args, sudo: ctx.sudo, code });
    return code;
  }

  // Shared option parser. letters: allowed short flags; long: { '--x': 'flag' }.
  // Returns { f: Set, ops: [] } or { code } when it already printed an error / help.
  opts(name, args, letters, long, ctx, badCode = 1) {
    const f = new Set(), ops = [];
    let done = false;
    for (const a of args) {
      if (done || a === '-' || !a.startsWith('-')) { ops.push(a); continue; }
      if (a === '--') { done = true; continue; }
      if (a.startsWith('--')) {
        if (a === '--help') { ctx.out((MAN[name] || `${name}: ไม่มีคู่มือ`) + '\n'); return { code: 0 }; }
        const key = a.split('=')[0];
        if (long[key]) { f.add(long[key]); continue; }
        ctx.err(`${name}: unrecognized option '${a}'\nTry '${name} --help' for more information.\n`);
        return { code: badCode };
      }
      for (const ch of a.slice(1)) {
        if (!letters.includes(ch)) {
          ctx.err(`${name}: invalid option -- '${ch}'\nTry '${name} --help' for more information.\n`);
          return { code: badCode };
        }
        f.add(ch);
      }
    }
    return { f, ops };
  }

  // Recursive copy of a node; non-sudo copies are owned by the student.
  copyNode(n, sudo) {
    const c = structuredClone(n);
    if (!sudo) { const strip = x => { delete x.priv; delete x.ro; if (x.t === 'd') Object.values(x.kids).forEach(strip); }; strip(c); c.priv = false; }
    return c;
  }
}

// ---------- commands ----------

const cmds = {};
Shell.prototype.cmds = cmds;

cmds.pwd = function (args, ctx) { ctx.out(this.cwd + '\n'); return 0; };
cmds.whoami = function (args, ctx) { ctx.out((ctx.sudo ? 'root' : 'student') + '\n'); return 0; };
cmds.clear = function () { this.io.clear(); return 0; };
cmds.exit = function (args, ctx) { ctx.out('exit\n(ออกไม่ได้หรอก ป้าเซิร์ฟยังต้องการเรา!)\n'); return 0; };
cmds.echo = function (args, ctx) {
  let nl = true;
  if (args[0] === '-n') { nl = false; args = args.slice(1); }
  ctx.out(args.join(' ') + (nl ? '\n' : ''));
  return 0;
};
cmds.help = function (args, ctx) {
  ctx.out('คำสั่งในเกม: ' + [...CORE, 'pwd', 'grep', 'wc', 'xargs', 'echo', 'man', 'clear'].join('  ') +
    '\nดูคู่มือ: man ชื่อคำสั่ง   หรือ   ชื่อคำสั่ง --help\n');
  return 0;
};
cmds.man = function (args, ctx) {
  if (!args.length) { ctx.err('What manual page do you want?\nFor example, try \'man man\'.\n'); return 1; }
  const page = MAN[args[0]];
  if (!page) { ctx.err(`No manual entry for ${args[0]}\n`); return 16; }
  ctx.out(page + '\n');
  return 0;
};

cmds.cd = function (args, ctx) {
  if (args.length > 1) { ctx.err('bash: cd: too many arguments\n'); return 1; }
  let p = args[0];
  if (p === undefined || p === '') p = HOME;
  if (p === '-') { p = this.oldpwd; ctx.out(p + '\n'); }
  const abs = this.abs(p);
  const r = this.fs.lookup(abs, false);
  if (r.err === 'EACCES') { ctx.err(`bash: cd: ${args[0]}: Permission denied\n`); return 1; }
  if (r.err === 'ENOTDIR') { ctx.err(`bash: cd: ${args[0]}: Not a directory\n`); return 1; }
  if (r.err) { ctx.err(`bash: cd: ${args[0]}: No such file or directory\n`); return 1; }
  if (r.node.t !== 'd') { ctx.err(`bash: cd: ${args[0]}: Not a directory\n`); return 1; }
  if (r.node.priv) { ctx.err(`bash: cd: ${args[0]}: Permission denied\n`); return 1; }
  this.oldpwd = this.cwd;
  this.cwd = abs;
  return 0;
};

function human(n) {
  if (n < 1024) return String(n);
  const u = ['K', 'M', 'G', 'T'];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return (n < 10 ? (Math.ceil(n * 10) / 10).toFixed(1) : String(Math.ceil(n))) + u[i];
}

cmds.ls = function (args, ctx) {
  const o = this.opts('ls', args, 'alh1AdR', { '--all': 'a', '--human-readable': 'h', '--almost-all': 'A' }, ctx, 2);
  if (o.code !== undefined) return o.code;
  const all = o.f.has('a'), almost = o.f.has('A'), long = o.f.has('l'), hr = o.f.has('h');
  const one = o.f.has('1') || !ctx.isTTY;
  const ops = o.ops.length ? o.ops : ['.'];
  let code = 0;
  const files = [], dirs = [];
  for (const p of ops) {
    const r = this.fs.lookup(this.abs(p), ctx.sudo);
    if (r.err === 'EACCES') { ctx.err(`ls: cannot access ${qa(p)}: Permission denied\n`); code = 2; continue; }
    if (r.err === 'ENOTDIR') { ctx.err(`ls: cannot access ${qa(p)}: Not a directory\n`); code = 2; continue; }
    if (r.err) { ctx.err(`ls: cannot access ${qa(p)}: No such file or directory\n`); code = 2; continue; }
    if (r.node.t === 'd' && !o.f.has('d')) dirs.push([p, r.node]); else files.push([p, r.node]);
  }
  const color = (name, n) => (ctx.isTTY && n.t === 'd' ? C.dir + name + C.off : name);
  const fmtLong = entries => {
    const sz = entries.map(([, n]) => (hr ? human(sizeOf(n)) : String(sizeOf(n))));
    const w = Math.max(0, ...sz.map(s => s.length));
    return entries.map(([name, n], i) => {
      const root = n.priv || n.ro;
      const perm = n.t === 'd' ? (n.priv ? 'drwx------' : 'drwxr-xr-x') : (n.priv ? '-rw-------' : '-rw-r--r--');
      const links = n.t === 'd' ? 2 + Object.values(n.kids).filter(k => k.t === 'd').length : 1;
      const who = root ? 'root    root   ' : 'student student';
      return `${perm} ${links} ${who} ${sz[i].padStart(w)} Sep 26 07:12 ${color(name, n)}`;
    }).join('\n') + '\n';
  };
  const emit = entries => {
    if (!entries.length) return;
    if (long) ctx.out(fmtLong(entries));
    else ctx.out(entries.map(([name, n]) => color(name, n)).join(one ? '\n' : '  ') + '\n');
  };
  emit(files);
  dirs.forEach(([p, node], idx) => {
    if (files.length || dirs.length > 1) ctx.out((files.length || idx ? '\n' : '') + p + ':\n');
    if (node.priv && !ctx.sudo) { ctx.err(`ls: cannot open directory ${qa(p)}: Permission denied\n`); code = 2; return; }
    let names = Object.keys(node.kids).filter(k => all || almost || !k.startsWith('.'));
    names = lsSort(names);
    const entries = names.map(k => [k, node.kids[k]]);
    if (all) entries.unshift(['.', node], ['..', node]);
    if (long) {
      const total = entries.reduce((s, [, n]) => s + Math.ceil(sizeOf(n) / 4096) * 4, 0);
      ctx.out(`total ${hr ? human(total * 1024) : total}\n`);
    }
    emit(entries);
  });
  return code;
};

cmds.cat = function (args, ctx) {
  const o = this.opts('cat', args, 'nA', {}, ctx);
  if (o.code !== undefined) return o.code;
  if (!o.ops.length) { ctx.out(ctx.stdin || ''); return 0; }
  let code = 0;
  for (const p of o.ops) {
    if (p === '-') { ctx.out(ctx.stdin || ''); continue; }
    const r = this.fs.lookup(this.abs(p), ctx.sudo);
    if (r.err === 'EACCES') { ctx.err(`cat: ${qn(p)}: Permission denied\n`); code = 1; continue; }
    if (r.err === 'ENOTDIR') { ctx.err(`cat: ${qn(p)}: Not a directory\n`); code = 1; continue; }
    if (r.err) { ctx.err(`cat: ${qn(p)}: No such file or directory\n`); code = 1; continue; }
    if (r.node.t === 'd') { ctx.err(`cat: ${qn(p)}: Is a directory\n`); code = 1; continue; }
    if (!canRead(r.node, ctx.sudo)) { ctx.err(`cat: ${qn(p)}: Permission denied\n`); code = 1; continue; }
    let text = r.node.content;
    if (o.f.has('n')) text = text.replace(/\n$/, '').split('\n').map((l, i) => String(i + 1).padStart(6) + '\t' + l).join('\n') + '\n';
    ctx.out(text);
  }
  return code;
};

cmds.mkdir = function (args, ctx) {
  const o = this.opts('mkdir', args, 'pv', { '--parents': 'p', '--verbose': 'v' }, ctx);
  if (o.code !== undefined) return o.code;
  if (!o.ops.length) { ctx.err("mkdir: missing operand\nTry 'mkdir --help' for more information.\n"); return 1; }
  let code = 0;
  for (const p of o.ops) {
    const abs = this.abs(p);
    const r = this.fs.lookup(abs, ctx.sudo);
    if (r.node) {
      if (o.f.has('p') && r.node.t === 'd') continue;
      ctx.err(`mkdir: cannot create directory ${qa(p)}: File exists\n`); code = 1; continue;
    }
    if (o.f.has('p')) {
      let node = this.fs.root, ok = true;
      const parts = abs.split('/').filter(Boolean);
      for (const part of parts) {
        if (node.t !== 'd') { ctx.err(`mkdir: cannot create directory ${qa(p)}: Not a directory\n`); ok = false; break; }
        if (!node.kids[part]) {
          if (!canWriteDir(node, ctx.sudo)) { ctx.err(`mkdir: cannot create directory ${qa(p)}: Permission denied\n`); ok = false; break; }
          node.kids[part] = { t: 'd', priv: false, kids: {} };
          if (o.f.has('v')) ctx.out(`mkdir: created directory ${qa(part)}\n`);
        } else if (node.kids[part].priv && !ctx.sudo) { ctx.err(`mkdir: cannot create directory ${qa(p)}: Permission denied\n`); ok = false; break; }
        node = node.kids[part];
      }
      if (!ok) code = 1;
      continue;
    }
    if (r.err === 'EACCES') { ctx.err(`mkdir: cannot create directory ${qa(p)}: Permission denied\n`); code = 1; continue; }
    if (r.err === 'ENOTDIR') { ctx.err(`mkdir: cannot create directory ${qa(p)}: Not a directory\n`); code = 1; continue; }
    if (!r.parentOk) { ctx.err(`mkdir: cannot create directory ${qa(p)}: No such file or directory\n`); code = 1; continue; }
    if (!canWriteDir(r.parent, ctx.sudo)) { ctx.err(`mkdir: cannot create directory ${qa(p)}: Permission denied\n`); code = 1; continue; }
    r.parent.kids[r.name] = { t: 'd', priv: false, kids: {} };
    if (o.f.has('v')) ctx.out(`mkdir: created directory ${qa(p)}\n`);
  }
  return code;
};

// Resolve "SOURCE... DEST" for cp/mv. Returns { dest, dabs, destDir } or null after printing an error.
function destOf(sh, name, ops, ctx) {
  if (!ops.length) { ctx.err(`${name}: missing file operand\nTry '${name} --help' for more information.\n`); return null; }
  if (ops.length === 1) { ctx.err(`${name}: missing destination file operand after ${qa(ops[0])}\nTry '${name} --help' for more information.\n`); return null; }
  const dest = ops[ops.length - 1];
  const dabs = sh.abs(dest);
  const d = sh.fs.lookup(dabs, ctx.sudo);
  const destDir = !!d.node && d.node.t === 'd';
  if (ops.length > 2 && !destDir) { ctx.err(`${name}: target ${qa(dest)}: ${d.node ? 'Not a directory' : 'No such file or directory'}\n`); return null; }
  return { dest, dabs, destDir };
}

cmds.cp = function (args, ctx) {
  const o = this.opts('cp', args, 'rRivfa', { '--recursive': 'r', '--interactive': 'i', '--verbose': 'v', '--force': 'f', '--archive': 'a' }, ctx);
  if (o.code !== undefined) return o.code;
  const D = destOf(this, 'cp', o.ops, ctx);
  if (!D) return 1;
  const R = o.f.has('r') || o.f.has('R') || o.f.has('a');
  let code = 0;
  for (const src of o.ops.slice(0, -1)) {
    const sabs = this.abs(src);
    const s = this.fs.lookup(sabs, ctx.sudo);
    if (s.err === 'EACCES') { ctx.err(`cp: cannot stat ${qa(src)}: Permission denied\n`); code = 1; continue; }
    if (s.err) { ctx.err(`cp: cannot stat ${qa(src)}: No such file or directory\n`); code = 1; continue; }
    const isDir = s.node.t === 'd';
    if (isDir && !R) { ctx.err(`cp: -r not specified; omitting directory ${qa(src)}\n`); code = 1; continue; }
    const tabs = D.destDir ? normalize(D.dabs + '/' + basename(sabs)) : D.dabs;
    const tdisp = D.destDir ? this.join(D.dest, basename(src)) : D.dest;
    if (!D.destDir && D.dest.endsWith('/') && !isDir) { ctx.err(`cp: cannot create regular file ${qa(D.dest)}: Not a directory\n`); code = 1; continue; }
    if (tabs === sabs) { ctx.err(`cp: ${qa(src)} and ${qa(tdisp)} are the same file\n`); code = 1; continue; }
    if (isDir && tabs.startsWith(sabs + '/')) { ctx.err(`cp: cannot copy a directory, ${qa(src)}, into itself, ${qa(tdisp)}\n`); code = 1; continue; }
    if (!canRead(s.node, ctx.sudo)) { ctx.err(`cp: cannot open ${qa(src)} for reading: Permission denied\n`); code = 1; continue; }
    const t = this.fs.lookup(tabs, ctx.sudo);
    const what = isDir ? 'directory' : 'regular file';
    if (t.err === 'EACCES') { ctx.err(`cp: cannot create ${what} ${qa(tdisp)}: Permission denied\n`); code = 1; continue; }
    if (t.err && !t.parentOk) { ctx.err(`cp: cannot create ${what} ${qa(tdisp)}: No such file or directory\n`); code = 1; continue; }
    const parent = t.parent;
    if (!canWriteDir(parent, ctx.sudo)) { ctx.err(`cp: cannot create ${what} ${qa(tdisp)}: Permission denied\n`); code = 1; continue; }
    const existing = t.node;
    if (existing && existing.t === 'd' && !isDir) { ctx.err(`cp: cannot overwrite directory ${qa(tdisp)} with non-directory\n`); code = 1; continue; }
    if (existing && existing.t !== 'd' && isDir) { ctx.err(`cp: cannot overwrite non-directory ${qa(tdisp)} with directory ${qa(src)}\n`); code = 1; continue; }
    const copy = this.copyNode(s.node, ctx.sudo);
    if (existing && isDir) {
      const merge = (dst, from) => { for (const [k, v] of Object.entries(from.kids)) { if (v.t === 'd' && dst.kids[k]?.t === 'd') merge(dst.kids[k], v); else dst.kids[k] = v; } };
      merge(existing, copy);
    } else parent.kids[t.name] = copy;
    if (o.f.has('v')) ctx.out(`${qa(src)} -> ${qa(tdisp)}\n`);
  }
  return code;
};

cmds.mv = function (args, ctx) {
  const o = this.opts('mv', args, 'ivfn', { '--interactive': 'i', '--verbose': 'v', '--force': 'f' }, ctx);
  if (o.code !== undefined) return o.code;
  const D = destOf(this, 'mv', o.ops, ctx);
  if (!D) return 1;
  let code = 0;
  for (const src of o.ops.slice(0, -1)) {
    const sabs = this.abs(src);
    const s = this.fs.lookup(sabs, ctx.sudo);
    if (s.err === 'EACCES') { ctx.err(`mv: cannot stat ${qa(src)}: Permission denied\n`); code = 1; continue; }
    if (s.err) { ctx.err(`mv: cannot stat ${qa(src)}: No such file or directory\n`); code = 1; continue; }
    const tabs = D.destDir ? normalize(D.dabs + '/' + basename(sabs)) : D.dabs;
    const tdisp = D.destDir ? this.join(D.dest, basename(src)) : D.dest;
    if (!D.destDir && D.dest.endsWith('/') && s.node.t !== 'd') { ctx.err(`mv: cannot move ${qa(src)} to ${qa(D.dest)}: Not a directory\n`); code = 1; continue; }
    if (tabs === sabs) { ctx.err(`mv: ${qa(src)} and ${qa(tdisp)} are the same file\n`); code = 1; continue; }
    if (s.node.t === 'd' && tabs.startsWith(sabs + '/')) { ctx.err(`mv: cannot move ${qa(src)} to a subdirectory of itself, ${qa(tdisp)}\n`); code = 1; continue; }
    const t = this.fs.lookup(tabs, ctx.sudo);
    if (t.err === 'EACCES') { ctx.err(`mv: cannot move ${qa(src)} to ${qa(tdisp)}: Permission denied\n`); code = 1; continue; }
    if (t.err && !t.parentOk) { ctx.err(`mv: cannot move ${qa(src)} to ${qa(tdisp)}: No such file or directory\n`); code = 1; continue; }
    if (!canWriteDir(s.parent, ctx.sudo) || !canWriteDir(t.parent, ctx.sudo)) { ctx.err(`mv: cannot move ${qa(src)} to ${qa(tdisp)}: Permission denied\n`); code = 1; continue; }
    if (t.node) {
      if (t.node.t === 'd' && s.node.t !== 'd') { ctx.err(`mv: cannot overwrite directory ${qa(tdisp)} with non-directory\n`); code = 1; continue; }
      if (t.node.t !== 'd' && s.node.t === 'd') { ctx.err(`mv: cannot overwrite non-directory ${qa(tdisp)} with directory ${qa(src)}\n`); code = 1; continue; }
      if (t.node.t === 'd' && Object.keys(t.node.kids).length) { ctx.err(`mv: cannot move ${qa(src)} to ${qa(tdisp)}: Directory not empty\n`); code = 1; continue; }
    }
    delete s.parent.kids[s.name];
    t.parent.kids[t.name] = s.node;
    if (o.f.has('v')) ctx.out(`renamed ${qa(src)} -> ${qa(tdisp)}\n`);
  }
  return code;
};

cmds.rm = async function (args, ctx) {
  const o = this.opts('rm', args, 'rRfiIdv', { '--recursive': 'r', '--force': 'f', '--interactive': 'i', '--no-preserve-root': 'NPR', '--verbose': 'v', '--dir': 'd' }, ctx);
  if (o.code !== undefined) return o.code;
  const R = o.f.has('r') || o.f.has('R'), F = o.f.has('f'), I = o.f.has('i') && !F, V = o.f.has('v');
  if (!o.ops.length) {
    if (F) return 0;
    ctx.err("rm: missing operand\nTry 'rm --help' for more information.\n");
    return 1;
  }
  const ask = async q => { const a = await this.io.prompt(q, {}); return !!a && /^y/i.test(a.trim()); };
  let code = 0;
  const rmTree = async (disp, node, parent, key) => {
    if (node.t === 'd') {
      if (node.priv && !ctx.sudo) { ctx.err(`rm: cannot remove ${qa(disp)}: Permission denied\n`); return false; }
      if (I && Object.keys(node.kids).length && !(await ask(`rm: descend into directory ${qa(disp)}? `))) return false;
      let ok = true;
      for (const [k, c] of Object.entries(node.kids)) {
        const cd = this.join(disp, k);
        if (!canWriteDir(node, ctx.sudo)) { ctx.err(`rm: cannot remove ${qa(cd)}: Permission denied\n`); ok = false; continue; }
        ok = (await rmTree(cd, c, node, k)) && ok;
      }
      if (!ok) return false;
      if (I && !(await ask(`rm: remove directory ${qa(disp)}? `))) return false;
      delete parent.kids[key];
      if (V) ctx.out(`removed directory ${qa(disp)}\n`);
      return true;
    }
    const empty = sizeOf(node) === 0;
    if (!F && (node.priv || node.ro) && !ctx.sudo) {
      if (!(await ask(`rm: remove write-protected regular ${empty ? 'empty ' : ''}file ${qa(disp)}? `))) return false;
    } else if (I && !(await ask(`rm: remove regular ${empty ? 'empty ' : ''}file ${qa(disp)}? `))) return false;
    delete parent.kids[key];
    if (V) ctx.out(`removed ${qa(disp)}\n`);
    return true;
  };
  for (const p of o.ops) {
    const abs = this.abs(p);
    if (abs === '/' && R) {
      if (!o.f.has('NPR')) {
        ctx.err("rm: it is dangerous to operate recursively on '/'\nrm: use --no-preserve-root to override this failsafe\n");
        code = 1; continue;
      }
      if (ctx.sudo) { this.fs.root.kids = {}; this.flags.wiped = true; continue; }
      for (const k of Object.keys(this.fs.root.kids)) ctx.err(`rm: cannot remove '/${k}': Permission denied\n`);
      code = 1; continue;
    }
    const bn = basename(p);
    if (bn === '.' || bn === '..') { ctx.err(`rm: refusing to remove '.' or '..' directory: skipping ${qa(p)}\n`); code = 1; continue; }
    const r = this.fs.lookup(abs, ctx.sudo);
    if (r.err === 'EACCES') { ctx.err(`rm: cannot remove ${qa(p)}: Permission denied\n`); code = 1; continue; }
    if (r.err === 'ENOTDIR') { ctx.err(`rm: cannot remove ${qa(p)}: Not a directory\n`); code = 1; continue; }
    if (r.err) { if (!F) { ctx.err(`rm: cannot remove ${qa(p)}: No such file or directory\n`); code = 1; } continue; }
    const n = r.node;
    if (n.t === 'd' && !R) {
      if (o.f.has('d') && !Object.keys(n.kids).length) { delete r.parent.kids[r.name]; continue; }
      ctx.err(`rm: cannot remove ${qa(p)}: Is a directory\n`); code = 1; continue;
    }
    if (!canWriteDir(r.parent, ctx.sudo)) { ctx.err(`rm: cannot remove ${qa(p)}: Permission denied\n`); code = 1; continue; }
    if (!(await rmTree(p, n, r.parent, r.name))) code = code || (F ? 0 : 1);
  }
  return code;
};

cmds.find = function (args, ctx) {
  let i = 0;
  const paths = [];
  while (i < args.length && !(args[i].startsWith('-') && args[i].length > 1) && args[i] !== '!' && args[i] !== '(') paths.push(args[i++]);
  if (!paths.length) paths.push('.');
  // expression: groups separated by -o; each group is a list of { neg, test } / { act }
  const groups = [[]];
  let hasAction = false, hasDelete = false, maxdepth = Infinity, mindepth = 0, neg = false;
  const unitSize = { c: 1, b: 512, k: 1024, M: 1024 ** 2, G: 1024 ** 3 };
  while (i < args.length) {
    const a = args[i++];
    const need = () => {
      if (i >= args.length) { ctx.err(`find: missing argument to \`${a}'\n`); throw 1; }
      return args[i++];
    };
    const push = test => { groups[groups.length - 1].push({ neg, test }); neg = false; };
    try {
      switch (a) {
        case '-name': case '-iname': { const re = globToRe(need(), a === '-iname'); push((p, n, name) => re.test(name)); break; }
        case '-type': {
          const t = need();
          if (!['f', 'd'].includes(t)) { ctx.err(`find: Unknown argument to -type: ${t}\n`); return 1; }
          push((p, n) => n.t === t); break;
        }
        case '-size': {
          const s = need();
          const m = /^([+-]?)(\d+)([cbkMG]?)$/.exec(s);
          if (!m) { ctx.err(`find: invalid argument \`${s}' to \`-size'\n`); return 1; }
          const unit = unitSize[m[3] || 'b'], num = +m[2];
          push((p, n) => {
            if (n.t === 'd' && m[3] !== 'c' && m[3] !== 'b' && m[3] !== '') return m[1] === '-' ? Math.ceil(4096 / unit) < num : false;
            const u = Math.ceil(sizeOf(n) / unit);
            return m[1] === '+' ? u > num : m[1] === '-' ? u < num : u === num;
          });
          break;
        }
        case '-empty': push((p, n) => (n.t === 'd' ? !Object.keys(n.kids).length : sizeOf(n) === 0)); break;
        case '-maxdepth': maxdepth = parseInt(need(), 10); break;
        case '-mindepth': mindepth = parseInt(need(), 10); break;
        case '-print': hasAction = true; groups[groups.length - 1].push({ act: 'print' }); break;
        case '-delete': hasAction = hasDelete = true; groups[groups.length - 1].push({ act: 'delete' }); break;
        case '!': case '-not': neg = !neg; break;
        case '-o': case '-or': groups.push([]); break;
        case '-a': case '-and': break;
        default:
          if (a.startsWith('-')) ctx.err(`find: unknown predicate \`${a}'\n`);
          else ctx.err(`find: paths must precede expression: \`${a}'\nfind: possible unquoted pattern after predicate \`${groups.flat().length ? '-name' : a}'?\n`);
          return 1;
      }
    } catch (e) { if (e === 1) return 1; throw e; }
  }
  let code = 0;
  const doDelete = (disp, node, parent, key) => {
    if (!parent) return;
    if (node.t === 'd' && Object.keys(node.kids).length) { ctx.err(`find: cannot delete ${qa(disp)}: Directory not empty\n`); code = 1; return; }
    if (!canWriteDir(parent, ctx.sudo)) { ctx.err(`find: cannot delete ${qa(disp)}: Permission denied\n`); code = 1; return; }
    delete parent.kids[key];
  };
  const evaluate = (disp, node, parent, key) => {
    const name = basename(disp);
    for (const g of groups) {
      let ok = true;
      for (const it of g) {
        if (it.act === 'print') ctx.out(disp + '\n');
        else if (it.act === 'delete') doDelete(disp, node, parent, key);
        else if (it.test(disp, node, name) === it.neg) { ok = false; break; }
      }
      if (ok) { if (!hasAction) ctx.out(disp + '\n'); return; }
    }
  };
  const visit = (disp, node, parent, key, depth) => {
    const self = () => { if (depth >= mindepth) evaluate(disp, node, parent, key); };
    if (!hasDelete) self();
    if (node.t === 'd' && depth < maxdepth) {
      if (node.priv && !ctx.sudo) { ctx.err(`find: ${qa(disp)}: Permission denied\n`); code = 1; }
      else for (const [k, c] of Object.entries(node.kids)) visit(this.join(disp, k), c, node, k, depth + 1);
    }
    if (hasDelete) self();
  };
  for (const p of paths) {
    const r = this.fs.lookup(this.abs(p), ctx.sudo);
    if (r.err === 'EACCES') { ctx.err(`find: ${qa(p)}: Permission denied\n`); code = 1; continue; }
    if (r.err) { ctx.err(`find: ${qa(p)}: No such file or directory\n`); code = 1; continue; }
    visit(p, r.node, p === '.' || p === '/' ? null : r.parent, r.name, 0);
  }
  return code;
};

// Read FILE operands (or stdin) for grep/wc. Yields [label, text, node|null].
function* inputs(sh, name, ops, ctx, errs) {
  if (!ops.length) { yield [null, ctx.stdin || '', null]; return; }
  for (const p of ops) {
    if (p === '-') { yield ['(standard input)', ctx.stdin || '', null]; continue; }
    const r = sh.fs.lookup(sh.abs(p), ctx.sudo);
    if (r.err === 'EACCES') { ctx.err(`${name}: ${qn(p)}: Permission denied\n`); errs.n++; continue; }
    if (r.err) { ctx.err(`${name}: ${qn(p)}: No such file or directory\n`); errs.n++; continue; }
    if (r.node.t === 'd') { ctx.err(`${name}: ${qn(p)}: Is a directory\n`); errs.n++; if (name === 'wc') yield [p, null, r.node]; continue; }
    if (!canRead(r.node, ctx.sudo)) { ctx.err(`${name}: ${qn(p)}: Permission denied\n`); errs.n++; continue; }
    yield [p, r.node.content, r.node];
  }
}

// POSIX basic regex -> JS: in BRE, + ? | ( ) { } are literal unless backslashed.
function breToRe(p) {
  let out = '';
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '\\' && i + 1 < p.length) { const d = p[++i]; out += '+?|(){}'.includes(d) ? d : '\\' + d; }
    else if ('+?|(){}'.includes(c)) out += '\\' + c;
    else out += c;
  }
  return out;
}

cmds.grep = function (args, ctx) {
  const o = this.opts('grep', args, 'ivcnwE', { '--ignore-case': 'i', '--invert-match': 'v', '--count': 'c', '--line-number': 'n' }, ctx, 2);
  if (o.code !== undefined) return o.code;
  if (!o.ops.length) { ctx.err("Usage: grep [OPTION]... PATTERNS [FILE]...\nTry 'grep --help' for more information.\n"); return 2; }
  const [pat, ...files] = o.ops;
  let src = o.f.has('E') ? pat : breToRe(pat);
  if (o.f.has('w')) src = `\\b(?:${src})\\b`;
  let re;
  try { re = new RegExp(src, o.f.has('i') ? 'i' : ''); } catch { re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), o.f.has('i') ? 'i' : ''); }
  const reG = new RegExp(re.source, re.flags + 'g');
  const errs = { n: 0 };
  let matched = false;
  const multi = files.length > 1;
  for (const [label, text] of inputs(this, 'grep', files, ctx, errs)) {
    const lines = text.replace(/\n$/, '').split('\n');
    if (text === '') lines.length = 0;
    let count = 0;
    lines.forEach((l, idx) => {
      if (re.test(l) === o.f.has('v')) return;
      count++; matched = true;
      if (o.f.has('c')) return;
      const shown = ctx.isTTY && !o.f.has('v') ? l.replace(reG, m => C.red + m + C.off) : l;
      ctx.out((multi ? label + ':' : '') + (o.f.has('n') ? idx + 1 + ':' : '') + shown + '\n');
    });
    if (o.f.has('c')) ctx.out((multi ? label + ':' : '') + count + '\n');
  }
  return errs.n ? 2 : matched ? 0 : 1;
};

cmds.wc = function (args, ctx) {
  const o = this.opts('wc', args, 'lwcm', { '--lines': 'l', '--words': 'w', '--bytes': 'c' }, ctx);
  if (o.code !== undefined) return o.code;
  const sel = ['l', 'w', 'c'].filter(k => o.f.has(k) || (k === 'c' && o.f.has('m')));
  const cols = sel.length ? sel : ['l', 'w', 'c'];
  const errs = { n: 0 };
  const rows = [];
  const tot = { l: 0, w: 0, c: 0 };
  for (const [label, text, node] of inputs(this, 'wc', o.ops, ctx, errs)) {
    const c = text === null ? { l: 0, w: 0, c: 0 } : {
      l: (text.match(/\n/g) || []).length,
      w: text.split(/\s+/).filter(Boolean).length,
      c: node ? sizeOf(node) : new TextEncoder().encode(text).length,
    };
    for (const k in tot) tot[k] += c[k];
    rows.push([label, c]);
  }
  if (o.ops.length > 1) rows.push(['total', tot]);
  const fromStdin = !o.ops.length;
  let width;
  if (fromStdin) width = sel.length === 1 ? 0 : 7;
  else if (rows.length === 1 && cols.length === 1) width = 0;
  else width = Math.max(1, ...rows.flatMap(([, c]) => cols.map(k => String(c[k]).length)));
  for (const [label, c] of rows) ctx.out(cols.map(k => String(c[k]).padStart(width)).join(' ') + (label ? ' ' + label : '') + '\n');
  return errs.n ? 1 : 0;
};

cmds.xargs = async function (args, ctx) {
  let i = 0, noEmpty = false;
  while (args[i] && args[i].startsWith('-')) { if (args[i] === '-r' || args[i] === '--no-run-if-empty') noEmpty = true; i++; }
  const cmd = args.slice(i).length ? args.slice(i) : ['echo'];
  const items = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(ctx.stdin || ''))) items.push(m[1] ?? m[2] ?? m[3]);
  if (!items.length && noEmpty) return 0;
  if (!this.cmds[cmd[0]]) { ctx.err(`xargs: ${cmd[0]}: No such file or directory\n`); return 127; }
  const code = await this.runCommand([...cmd, ...items], { ...ctx, stdin: '' });
  if (code === 0) return 0;
  if (code === 255) return 124;
  if (code === 127) return 127;
  return 123;
};

cmds.sudo = async function (args, ctx) {
  while (args[0] && args[0].startsWith('-')) args = args.slice(1);
  if (!args.length) {
    ctx.err('usage: sudo -h | -K | -k | -V\nusage: sudo [-ABbEHknPS] [-C num] [-D directory] [-g group] [-h host] [-p prompt] [-u user] [VAR=value] [-i | -s] [command [arg ...]]\n');
    return 1;
  }
  if (!this.sudoAuth) {
    for (let t = 0; t < 3; t++) {
      const pw = await this.io.prompt('[sudo] password for student: ', { hidden: true });
      if (pw === null) { ctx.err('sudo: a password is required\n'); return 1; }
      if (pw === this.password) { this.sudoAuth = true; break; }
      if (t < 2) ctx.err('Sorry, try again.\n');
    }
    if (!this.sudoAuth) { ctx.err('sudo: 3 incorrect password attempts\n'); return 1; }
  }
  const name = args[0];
  if (BUILTINS.has(name) && name !== 'echo' && name !== 'pwd') { ctx.err(`sudo: ${name}: command not found\n`); return 1; }
  if (!this.cmds[name]) { ctx.err(`sudo: ${name}: command not found\n`); return 1; }
  return this.runCommand(args, { ...ctx, sudo: true });
};

const power = function (args, ctx) {
  if (!ctx.sudo) {
    ctx.err('Failed to power off system via logind: Interactive authentication required.\n');
    return 1;
  }
  this.flags.poweroff = true;
  return 0;
};
cmds.poweroff = power;
cmds.shutdown = power;
cmds.reboot = power;
