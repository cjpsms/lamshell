// Offline interpreter: a small Thai phrase dictionary used when Claude is unreachable (no server, or the web demo).
// It covers the everyday sentences of phases 1-3 ("ดูไฟล์", "เข้าห้องพักครู", "ก๊อปการบ้านไปไว้ใน backup",
// "ls ไฟล์ที่ซ่อนอยู่", ...) and returns the same shape as server.py: { command, confidence, explain, parts, reply }.
// It follows the same rules as the AI prompt: translate literally (errors are the lesson), never add sudo unless the
// player asked for admin rights, and in phase 3 keep the command name the player typed.

// Thai words for places and files that have no Thai name in the level's own aliases.
const PLACES = {
  'ห้องพักครู': 'teachers_room', 'ห้องครู': 'teachers_room', 'ห้องแล็บ': 'lab', 'แล็บ': 'lab', 'ห้องทดลอง': 'lab',
  'ห้องสมุด': 'library', 'ชมรม': 'club', 'โรงยิม': 'gym', 'ยิม': 'gym', 'เวที': 'stage', 'ห้องเก็บของ': 'storage',
  'ห้องเซิร์ฟเวอร์': 'server_room', 'เซิร์ฟเวอร์': 'server_room', 'ห้องสอบ': 'exam_room2', 'ตู้เซฟ': 'vault',
  'ที่หลบภัย': 'backup', 'อัลบั้ม': 'photos', 'รูปภาพ': 'photos', 'โครงงาน': 'projects',
  'ดาวน์โหลด': 'Downloads', 'บันทึก': 'notes', 'รายงาน': 'report.txt', 'คะแนน': 'scores.csv', 'จดหมาย': 'letter.txt',
  'การบ้าน': 'homework.txt', 'ข้อสอบ': 'exam.txt', 'รูปรุ่น': 'class_photo.jpg', 'เกรด': 'grades.txt', 'ไวรัส': 'virus.exe', 'log': 'system.log',
};
// รูท but not the รูท inside ครูที่/ครูทำ/ครูทุก (a Thai vowel or tone mark right after it = another word).
const SUDO = /sudo|สิทธิ์|สิทธิ|แอดมิน|admin|root|(?<!ค)รูท(?![\u0E30-\u0E3A\u0E47-\u0E4E])|ผู้ดูแล/i;

const GLOSS = {
  ls: 'list = ดูรายชื่อของในห้อง', cd: 'change directory = ย้ายไปอยู่ห้องอื่น', cat: 'แสดงเนื้อหาไฟล์บนจอ',
  mkdir: 'make directory = สร้างโฟลเดอร์', cp: 'copy = ก๊อป ของเดิมยังอยู่', mv: 'move = ย้าย (หรือเปลี่ยนชื่อ)',
  rm: 'remove = ลบ ไม่มีถังขยะ', find: 'ค้นหา ลงไปทุกห้องข้างใน', sudo: 'ทำในนามแอดมิน (root)', poweroff: 'ปิดเครื่อง',
  pwd: 'print working directory = บอกว่าตอนนี้อยู่ที่ไหน',
  '-a': 'all = รวมไฟล์ที่ซ่อนอยู่', '-l': 'แสดงแบบละเอียด', '-r': 'recursive = ทั้งโฟลเดอร์ ลงไปทุกชั้น',
  '-p': 'สร้างชั้นที่ยังไม่มีให้ครบ', '-name': 'ค้นจากชื่อ', '-type': 'ชนิดของที่หา', f: 'f = ไฟล์ (ไม่เอาโฟลเดอร์)',
  '-size': 'ขนาด', '.': 'ห้องที่อยู่ตอนนี้ (และทุกห้องข้างใน)', '..': 'ห้องที่ใหญ่กว่าหนึ่งชั้น', '~': 'บ้านของเรา (/home/student)',
};

// The folder listing sent with each request ("name/", "  nested.txt", "big.iso (700M)") -> entries.
function parseTree(tree) {
  const top = [], all = [];
  for (const line of (tree || '').split('\n')) {
    const m = /^( *)(.+?)(\/)?(?: \((\d+)M\))?$/.exec(line);
    if (!m || !m[2] || m[2] === '(ว่างเปล่า)') continue;
    const e = { name: m[2], dir: !!m[3], mb: m[4] ? +m[4] : 0, depth: m[1].length / 2 };
    all.push(e);
    if (!e.depth) top.push(e);
  }
  return { top, all };
}

const quote = n => (/[\s*?]/.test(n) ? `"${n}"` : n);

// Names the player mentioned, in order: English words that match something here, and Thai words from the aliases.
function namesIn(text, req, T) {
  const found = [];
  const aliases = { ...PLACES };
  for (const [k, v] of Object.entries(req.aliases || {})) aliases[k] = String(v).split(/\s/)[0];
  const here = T.top.map(e => e.name);
  const add = (name, at) => { if (name && !found.some(f => f.name === name)) found.push({ name, at }); };
  for (const [th, en] of Object.entries(aliases)) {
    const at = text.indexOf(th);
    if (at >= 0 && !Object.keys(aliases).some(k => k !== th && k.includes(th) && text.includes(k))) add(en, at);
  }
  // "รูป" / "วิดีโอ" with no name: the one picture/video in this room, if there is exactly one.
  for (const [re, ext] of [[/รูป(?!ภาพ|รุ่น)/, /\.(jpe?g|png|gif)$/i], [/วิดีโอ|วีดีโอ|คลิป/, /\.(mp4|mkv|mov)$/i]]) {
    const m = re.exec(text), hits = T.top.filter(e => !e.dir && ext.test(e.name));
    if (m && hits.length === 1) add(hits[0].name, m.index);
  }
  for (const m of text.matchAll(/[A-Za-z0-9_.~\-/"]+[A-Za-z0-9_.~\-/"]*/g)) {
    const w = m[0].replace(/"/g, '');
    if (/^(sudo|ls|cd|cat|mkdir|cp|mv|rm|find|pwd|poweroff|mb|m|gb|copy|move|delete|remove|search|list|go|read|into|to|in|all|hidden|file|files|folder|home|back|new|make|create|please|the|a)$/i.test(w) || /^\d+$/.test(w) || /^-/.test(w)) continue;
    const exact = here.find(n => n.toLowerCase() === w.toLowerCase());
    const close = exact || here.find(n => n.toLowerCase().startsWith(w.toLowerCase()) && w.length >= 3);
    add(close || w, m.index);
  }
  return found.sort((a, b) => a.at - b.at).map(f => f.name);
}

const isDir = (T, name) => T.top.some(e => e.name === name && e.dir) || /\/$/.test(name);
const sizeOver = text => { const m = /(?:ใหญ่|เกิน|มากกว่า|>)\D{0,12}(\d+)\s*(?:mb|m|เมก|เม็ก)?/i.exec(text); return m ? +m[1] : 0; };

// The command for a Thai request (phases 1-2), or null.
function intent(raw, req) {
  const T = parseTree(req.tree);
  // Plain substring matching, no word cutting: Thai particles like ที/อะ also sit inside words (ที่, มีอะไร).
  const text = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  const names = namesIn(raw, req, T);
  const sudo = SUDO.test(raw) ? 'sudo ' : '';
  const first = names[0], last = names[names.length - 1];
  const r = (flag, name) => (req.phase === 1 && isDir(T, name) ? flag : '');

  if (/ปิด\s*(คอม|เครื่อง)|ดับเครื่อง|shut\s*down|power\s*off|ปิดคอม/.test(text)) return sudo + 'poweroff';
  // "เราอยู่ไหน" = pwd, but "ไฟล์เกรดอยู่ไหน" asks where a thing is = find
  const where = /อยู่(ที่)?ไหน|ที่อยู่ตอนนี้|ตำแหน่ง/.test(text);
  if (where && !names.length && !/ไฟล์|โฟลเดอร์/.test(text)) return 'pwd';
  if (where || /หา|ค้น|search|find/.test(text)) {
    const mb = sizeOver(text);
    if (mb) return `${sudo}find . -type f -size +${mb}M`;
    const word = (text.match(/[a-z0-9_]{2,}/g) || []).find(w => !/^(find|search|mb)$/.test(w)) ||
      (first && first.replace(/\.[a-z]+$/, '').replace(/s$/, ''));
    return word ? `${sudo}find . -name "*${word}*"` : null;
  }
  if (/สร้าง|ทำโฟลเดอร์|new folder|mkdir/.test(text)) {
    const name = last || (text.match(/ชื่อ\s*([^\s]+)/) || [])[1];
    if (!name) return null;
    return `${sudo}mkdir ${/\/./.test(name) || /ซ้อน|หลายชั้น|ทุกชั้น/.test(text) ? '-p ' : ''}${quote(name)}`;
  }
  if (/เปลี่ยนชื่อ|rename/.test(text) && names.length >= 2) return `${sudo}mv ${quote(first)} ${quote(last)}`;
  if (/ก๊อป|ก็อป|ก้อป|คัดลอก|สำเนา|copy|สำรอง/.test(text) && names.length >= 2) {
    const all = /ทั้งโฟลเดอร์|ทั้งหมด|ทั้งตู้|ทั้งห้อง/.test(text) || r('-r', first);
    return `${sudo}cp ${all ? '-r ' : ''}${quote(first)} ${quote(last)}${isDir(T, last) ? '/' : ''}`;
  }
  if (/ย้าย|move|เอา.*ไป(ใส่|ไว้|เก็บ)|เก็บ.*(ไว้)?(ใน|ที่)/.test(text)) {
    // a move with only one name must not fall through to "ไป" = cd
    return names.length >= 2 ? `${sudo}mv ${quote(first)} ${quote(last)}${isDir(T, last) ? '/' : ''}` : null;
  }
  if (/ลบ|ทิ้ง|กำจัด|delete|remove/.test(text)) {
    const mb = sizeOver(text);
    if (mb) {
      let big = T.top.filter(e => !e.dir && e.mb > mb).map(e => e.name);
      if (/ขยะ|junk/.test(text)) big = big.filter(n => /junk/.test(n));
      return big.length ? `${sudo}rm ${big.map(quote).join(' ')}` : null;
    }
    if (!first) return null;
    const all = /ทั้งโฟลเดอร์|ทั้งหมด/.test(text) || r('-r', first);
    return `${sudo}rm ${all ? '-r ' : ''}${names.map(quote).join(' ')}`;
  }
  if ((/อ่าน|เปิดไฟล์|เปิดอ่าน|เนื้อหา|ข้างในไฟล์|read/.test(text) || /เปิด/.test(text) && !isDir(T, first || '/')) && first) return `${sudo}cat ${quote(first)}`;
  if (first && first.startsWith('/') && /เข้า|ไป|cd|go/.test(text)) return `cd ${quote(first)}`;   // a full path
  if (/กลับบ้าน|ไปบ้าน|\bhome\b/.test(text) && !/\//.test(text)) return 'cd ~';
  if (/ถอย|ออกไป|ออกจาก|ย้อนกลับ|ขึ้นไปชั้น|back/.test(text) && !first) return 'cd ..';
  if (/เข้า|ไปที่|ไปห้อง|เดินไป|ไป|go/.test(text) && first && !T.top.some(e => e.name === first && !e.dir)) return `cd ${quote(first)}`;
  if (/ดู|มีอะไร|มีไร|อะไรบ้าง|มีไฟล์|รายชื่อ|list|แสดง|ส่อง|ของในห้อง/.test(text)) {
    if (first && /เปิด|อ่าน/.test(text)) return `${sudo}cat ${quote(first)}`;
    const opts = (/ซ่อน|hidden/.test(text) ? 'a' : '') + (/ละเอียด|ขนาด/.test(text) ? 'l' : '');
    return `ls${opts ? ' -' + opts : ''}${first && isDir(T, first) ? ' ' + quote(first) : ''}`;
  }
  return null;
}

// Phase 3: the player typed the real command name; the rest may be Thai. Keep the command, translate the rest.
function args(cmd, rest, req) {
  const T = parseTree(req.tree);
  const text = rest.toLowerCase();
  const names = namesIn(rest, req, T);
  const plain = (rest.match(/(^|\s)(-\S+|[A-Za-z0-9_.~/"*-]+)/g) || []).map(s => s.trim()).filter(s => !/^[ก-๙]/.test(s));
  switch (cmd) {
    case 'ls': {
      const o = (/ซ่อน|hidden|all|ทั้งหมด/.test(text) ? 'a' : '') + (/ละเอียด|ขนาด|detail/.test(text) ? 'l' : '');
      return `ls${o ? ' -' + o : ''}${names[0] && isDir(T, names[0]) ? ' ' + names[0] : ''}`;
    }
    case 'cd':
      if (/บ้าน|home/.test(text)) return 'cd ~';
      if (/ถอย|ออก|ย้อน|back|ชั้นบน/.test(text)) return 'cd ..';
      return names[0] ? `cd ${quote(names[0])}` : null;
    case 'mkdir': {
      const path = plain.find(p => /\//.test(p)) || names[names.length - 1];
      return path ? `mkdir ${/\/./.test(path) || /ซ้อน|ทุกชั้น|หลายชั้น|create/.test(text) ? '-p ' : ''}${path.replace(/"/g, '')}` : null;
    }
    case 'cp': case 'mv': {
      if (names.length < 2) return null;
      const all = cmd === 'cp' && (/ทั้งโฟลเดอร์|ทั้งหมด|ทั้งตู้|all|whole/.test(text) || isDir(T, names[0]) && /โฟลเดอร์/.test(text));
      const dest = names[names.length - 1];
      return `${cmd} ${all ? '-r ' : ''}${quote(names[0])} ${quote(dest)}${isDir(T, dest) && cmd === 'cp' ? '/' : ''}`;
    }
    case 'rm': {
      const mb = sizeOver(text);
      if (mb) {
        let big = T.top.filter(e => !e.dir && e.mb > mb).map(e => e.name);
        if (/ขยะ|junk/.test(text)) big = big.filter(n => /junk/.test(n));
        return big.length ? `rm ${big.map(quote).join(' ')}` : null;
      }
      return names.length ? `rm ${/ทั้งโฟลเดอร์|ทั้งหมด/.test(text) ? '-r ' : ''}${names.map(quote).join(' ')}` : null;
    }
    case 'find': {
      const mb = sizeOver(text);
      const where = /ทั้งเครื่อง|ทุกที่/.test(text) ? '/' : '.';
      if (mb) return `find ${where} -type f -size +${mb}M`;
      const word = (rest.match(/[A-Za-z0-9_]{2,}/g) || [])[0];
      return word ? `find ${where} -name "*${word}*"` : null;
    }
    case 'cat': return names[0] ? `cat ${quote(names[0])}` : null;
    case 'sudo': { const [c, ...more] = rest.trim().split(/\s+/); const inner = c && args(c, more.join(' '), req); return inner ? 'sudo ' + inner : null; }
    default: return null;
  }
}

// Every part of a command explained, for the phase 2 lessons and phase 3 highlights.
function partsOf(command) {
  const parts = [];
  for (const tok of command.match(/"[^"]*"|\S+/g) || []) {
    let meaning = GLOSS[tok];
    if (!meaning && /^-[a-z]{2,}$/.test(tok)) meaning = [...tok.slice(1)].map(c => GLOSS['-' + c] || c).join(' + ');
    if (!meaning && /\*/.test(tok)) meaning = `ชื่ออะไรก็ได้ที่มี ${tok.replace(/["*]/g, '')} อยู่ (* = อะไรก็ได้, "..." ให้ find ได้ดอกจันไปใช้เอง)`;
    if (!meaning && /^\+\d+M$/.test(tok)) meaning = `ใหญ่กว่า ${tok.slice(1, -1)} MB`;
    if (!meaning && tok.includes('/')) meaning = `path: ${tok.replace(/\/$/, '').split('/').join(' → ')}`;
    if (!meaning) meaning = `ชื่อไฟล์/โฟลเดอร์ ${tok.replace(/"/g, '')}`;
    parts.push({ token: tok, meaning });
  }
  return parts;
}

export function offlineInterpret(req) {
  const text = (req.text || '').trim();
  const reply = 'น้องล่าม (โหมดออฟไลน์) ยังไม่รู้จักประโยคนี้ ลองพูดง่ายๆ เช่น "ดูไฟล์" "เข้าห้องพักครู" "อ่าน letter.txt" หรือพิมพ์คำสั่งจริงเลยก็ได้';
  let command = null;
  if (req.phase === 3) {
    const [cmd, ...rest] = text.split(/\s+/);
    command = args(cmd, rest.join(' '), req);
  } else {
    command = intent(text, req);
  }
  if (!command) return { command: null, confidence: 0, explain: '', parts: [], reply, offline: true, dictionary: true };
  const parts = partsOf(command);
  const main = command.replace(/^sudo /, '').split(' ')[0];
  return {
    command, confidence: 0.8, parts: req.phase === 1 ? [] : parts,
    explain: `${main} ${GLOSS[main] ? '= ' + GLOSS[main].replace(/^[a-z ]+= /, '') : ''} (แปลจากพจนานุกรมในเกม)`.trim(),
    reply: '', dictionary: true,
  };
}
