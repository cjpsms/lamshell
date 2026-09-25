// Virtual filesystem: a plain object tree, cloneable with structuredClone.
// Node shapes:
//   dir  : { t: 'd', priv: bool, kids: { name: node } }
//   file : { t: 'f', priv: bool, content: string, size: number|undefined }
// `priv` = owned by root with no access for others (mode 700/600): needs sudo to read/enter/modify.
// `ro`   = owned by root but world-readable (755/644): anyone can read/enter, only sudo can modify.

export const HOME = '/home/student';

const enc = new TextEncoder();

export function mkdirNode(priv = false) { return { t: 'd', priv, kids: {} }; }
export function mkfileNode(content = '', priv = false, size) {
  const n = { t: 'f', priv, content };
  if (size !== undefined) n.size = size;
  return n;
}
export function sizeOf(n) {
  if (n.t === 'd') return 4096;
  return n.size !== undefined ? n.size : enc.encode(n.content).length;
}

export function basename(p) {
  if (p === '/') return '/';
  const s = p.replace(/\/+$/, '');
  return s.slice(s.lastIndexOf('/') + 1);
}
export function dirname(p) {
  const s = p.replace(/\/+$/, '');
  const i = s.lastIndexOf('/');
  if (i < 0) return '.';
  if (i === 0) return '/';
  return s.slice(0, i);
}

export function normalize(abs) {
  const out = [];
  for (const part of abs.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return '/' + out.join('/');
}

export class VFS {
  constructor(root) { this.root = root || mkdirNode(); }

  clone() { return new VFS(structuredClone(this.root)); }

  // No tilde handling here: bash expands an unquoted ~ before a command sees it (Shell.expand),
  // and a quoted "~" is just a folder literally named ~.
  resolve(cwd, p) {
    return normalize(p.startsWith('/') ? p : cwd + '/' + p);
  }

  // Walk to an absolute path. Returns { node, parent, name, err }.
  // err: 'ENOENT' | 'ENOTDIR' | 'EACCES' (traversing a priv dir without sudo).
  lookup(abs, sudo = false) {
    const parts = abs.split('/').filter(Boolean);
    let node = this.root, parent = null, name = '/';
    for (let i = 0; i < parts.length; i++) {
      if (node.t !== 'd') return { err: 'ENOTDIR' };
      if (node.priv && !sudo) return { err: 'EACCES' };
      parent = node; name = parts[i];
      node = node.kids[name];
      if (!node) return { err: 'ENOENT', parent, name, parentOk: i === parts.length - 1 };
    }
    return { node, parent, name };
  }

  get(abs) { return this.lookup(abs, true).node || null; }
  exists(abs) { return !!this.get(abs); }
  isDir(abs) { const n = this.get(abs); return !!n && n.t === 'd'; }
  isFile(abs) { const n = this.get(abs); return !!n && n.t === 'f'; }
  read(abs) { const n = this.get(abs); return n && n.t === 'f' ? n.content : null; }

  // Level-building helpers (no permission checks).
  mkdirp(abs, priv = false) {
    let node = this.root;
    for (const part of abs.split('/').filter(Boolean)) {
      if (!node.kids[part]) node.kids[part] = mkdirNode(false);
      node = node.kids[part];
    }
    if (priv) node.priv = true;
    return node;
  }
  write(abs, content = '', opts = {}) {
    const parent = this.mkdirp(dirname(abs));
    if (content && !content.endsWith('\n')) content += '\n';
    const n = mkfileNode(content, !!opts.priv, opts.size);
    if (opts.ro) n.ro = true;
    parent.kids[basename(abs)] = n;
  }
  // Build a subtree from a spec: 'name/' keys are dirs, other keys are files
  // (string content, or { content, size, priv }). '__priv': true marks the dir itself.
  tree(abs, spec) {
    const dir = this.mkdirp(abs);
    for (const [k, v] of Object.entries(spec)) {
      if (k === '__priv') { dir.priv = !!v; continue; }
      if (k === '__ro') { dir.ro = !!v; continue; }
      if (k.endsWith('/')) this.tree(abs + '/' + k.slice(0, -1), v || {});
      else if (typeof v === 'string') this.write(abs + '/' + k, v);
      else this.write(abs + '/' + k, v.content || '', v);
    }
  }
  remove(abs) {
    const r = this.lookup(abs, true);
    if (r.node && r.parent) delete r.parent.kids[r.name];
  }

  // All paths below abs (inclusive), depth first.
  walk(abs, fn, node = this.get(abs)) {
    if (!node) return;
    fn(abs, node);
    if (node.t === 'd') for (const [k, c] of Object.entries(node.kids)) this.walk(abs === '/' ? '/' + k : abs + '/' + k, fn, c);
  }
  // Flat list of every path (for diffs / previews).
  allPaths() {
    const out = [];
    this.walk('/', (p, n) => out.push(p + (n.t === 'd' ? '/' : '')));
    return out;
  }
}

export const canRead = (n, sudo) => sudo || !n.priv;
export const canWriteDir = (n, sudo) => sudo || !(n.priv || n.ro);
export const canWriteFile = (n, sudo) => sudo || !(n.priv || n.ro);

// Standard skeleton every level starts from.
export function baseFS() {
  const fs = new VFS();
  fs.tree('/', {
    'dev/': { '__ro': true, 'null': '' },
    'bin/': { '__ro': true, 'bash': { content: '\x7fELF', size: 1446024 } },
    'etc/': { '__ro': true, 'hostname': 'pa-serv', 'passwd': 'root:x:0:0:root:/root:/bin/bash\nstudent:x:1000:1000::/home/student:/bin/bash',
              'shadow': { content: 'root:*:19000:0:99999:7:::', priv: true },
              'ssl/': { 'private/': { '__priv': true, 'server.key': 'secret' } } },
    'root/': { '__priv': true, 'notes.txt': 'ของพี่รูท ห้ามแตะ' },
    'tmp/': {},
    'var/': { 'log/': { 'syslog': 'Sep 26 07:00 pa-serv kernel: boot ok' }, 'lib/': { 'private/': { '__priv': true } } },
    'home/': { 'student/': {} },
  });
  return fs;
}
