// Error decoder: split a real error line into who-complains / about-what / why, with Thai explanations.

const REASONS = [
  [/command not found$/, 'ไม่มีคำสั่งชื่อนี้ในเครื่อง', 'เช็กตัวสะกด ตัวเล็กตัวใหญ่ (Linux แยก LS กับ ls) หรือลืมเปลี่ยนภาษาคีย์บอร์ดหรือเปล่า'],
  [/No such file or directory$/, 'ไม่มีไฟล์หรือโฟลเดอร์ชื่อนี้', 'สงสัยพิมพ์ชื่อผิด? ลอง ls ดูว่ามีอะไรอยู่บ้าง'],
  [/Is a directory$/, 'นี่คือโฟลเดอร์ ไม่ใช่ไฟล์', 'โฟลเดอร์อ่านด้วย cat ไม่ได้ ลอง ls ดูข้างในแทน (ถ้าจะลบ/ก๊อปทั้งโฟลเดอร์ต้องใส่ -r)'],
  [/Not a directory$/, 'นี่คือไฟล์ ไม่ใช่โฟลเดอร์', 'เข้าไปข้างในไฟล์ไม่ได้ ลอง ls ดูว่าอันไหนเป็นโฟลเดอร์จริง (สีฟ้า)'],
  [/File exists$/, 'มีชื่อนี้อยู่แล้ว', 'ไม่ต้องสร้างซ้ำ หรือตั้งชื่ออื่น'],
  [/Permission denied$/, 'ไม่มีสิทธิ์ (ของนี้เป็นของ root)', 'ถ้าจำเป็นจริงๆ ใช้ sudo นำหน้าคำสั่ง'],
  [/^missing operand$/, 'ขาดของที่ต้องใส่ต่อท้าย (ชื่อไฟล์/โฟลเดอร์)', 'บอกด้วยว่าจะทำกับอะไร เช่น mkdir ชื่อโฟลเดอร์'],
  [/^missing file operand$/, 'ไม่ได้บอกว่าจะก๊อป/ย้ายอะไร', 'ต้องมี ต้นทาง และ ปลายทาง'],
  [/^missing destination file operand after '(.+)'$/, 'บอกว่าจะเอา $1 แต่ไม่บอกว่าไปไว้ที่ไหน', 'เติมปลายทางต่อท้าย เช่น backup/'],
  [/^-r not specified; omitting directory '(.+)'$/, '$1 เป็นโฟลเดอร์ ต้องบอกว่าเอาทั้งโฟลเดอร์', 'ใส่ -r (recursive) เช่น cp -r'],
  [/^invalid option -- '(.)'$/, 'ไม่มีตัวเลือก -$1', 'พิมพ์ ชื่อคำสั่ง --help เพื่อดูตัวเลือกที่มีจริง'],
  [/^unrecognized option '(.+)'$/, 'ไม่รู้จักตัวเลือก $1', 'สะกดผิดหรือเปล่า? ดูตัวเลือกจริงด้วย --help'],
  [/^cannot move '(.+)' to a subdirectory of itself/, 'จะย้ายโฟลเดอร์เข้าไปในตัวมันเอง (หลุมดำ!)', 'ย้ายไปที่อื่นที่ไม่ได้อยู่ข้างใน $1'],
  [/^too many arguments$/, 'ใส่ของมาเยอะเกิน', 'cd ไปได้ทีละที่ ถ้าชื่อมีช่องว่างให้ครอบด้วย "..."'],
  [/^Sorry, try again\.$/, 'รหัสผ่านผิด', 'ลองใหม่ (พิมพ์รหัสแล้วจะไม่มีอะไรขึ้นจอ เป็นเรื่องปกติ)'],
  [/incorrect password attempts$/, 'ใส่รหัสผิด 3 ครั้ง', 'ถามรหัสจากพี่รูทอีกที แล้วสั่งใหม่'],
  [/Directory not empty$/, 'โฟลเดอร์ยังมีของอยู่ข้างใน', 'ต้องเอาของข้างในออกก่อน'],
  [/dangerous to operate recursively on '\/'$/, 'จะลบทั้งเครื่อง! rm เลยเบรกไว้ให้', 'ห้ามทำบนเครื่องจริงเด็ดขาด'],
  [/use --no-preserve-root to override/, 'บอกวิธีปลดเบรก (อย่าทำ!)', 'ระบบกันพลาดนี้มีไว้เพื่อช่วยชีวิต'],
  [/syntax error near unexpected token `(.+)'$/, 'เขียนผิดไวยากรณ์ตรง $1', 'เช็กว่า | > มีคำสั่ง/ไฟล์อยู่ทั้งสองฝั่ง'],
  [/unexpected EOF while looking for matching/, 'เปิดเครื่องหมายคำพูดแล้วไม่ปิด', 'ใส่ " หรือ \' ให้ครบคู่'],
  [/Interactive authentication required\.$/, 'ปิดเครื่องต้องใช้สิทธิ์ผู้ดูแล', 'ใช้ sudo poweroff'],
  [/^are the same file$/, 'ต้นทางกับปลายทางเป็นไฟล์เดียวกัน', 'ตั้งชื่อปลายทางให้ต่างกัน'],
  [/unknown predicate `(.+)'$/, 'find ไม่รู้จักเงื่อนไข $1', 'ดูเงื่อนไขที่มีด้วย man find'],
  [/missing argument to `(.+)'$/, 'เงื่อนไข $1 ต้องมีค่าตามหลัง', 'เช่น -name "*.txt"'],
  [/paths must precede expression/, 'ลืมใส่ "..." ครอบแบบชื่อ', 'เช่น find . -name "*.txt"'],
  [/is not a directory$|^target '(.+)'/, 'ปลายทางต้องเป็นโฟลเดอร์', 'ถ้าย้าย/ก๊อปหลายอัน ปลายทางต้องเป็นโฟลเดอร์ที่มีอยู่'],
];

const TRY = /^Try '(\S+) --help' for more information\.$/;

// Returns null for lines that aren't recognisable errors.
export function decode(line) {
  line = line.replace(/\x1b\[[0-9;]*m/g, '').trim();
  if (!line) return null;
  const t = TRY.exec(line);
  if (t) return { who: t[1], what: '', why: `แนะนำให้พิมพ์ ${t[1]} --help ดูวิธีใช้`, tip: '', tryLine: true };
  if (/^\[sudo\]/.test(line)) return null;

  // Split "who: [cmd: ] what: reason"
  let who = '', rest = line;
  let m = /^(bash|sudo): (cd): (.*)$/.exec(line) || /^(bash|sudo|ls|cat|mkdir|cp|mv|rm|find|grep|wc|xargs|head|sort|chmod): (.*)$/.exec(line);
  if (m) {
    if (m.length === 4) { who = `${m[1]} (${m[2]})`; rest = m[3]; } else { who = m[1]; rest = m[2]; }
  } else if (/^(Sorry|Failed to power|Usage:)/.test(line)) {
    who = line.startsWith('Sorry') ? 'sudo' : line.startsWith('Failed') ? 'poweroff' : 'grep';
  }
  let reason = rest, what = '';
  const idx = rest.lastIndexOf(': ');
  if (idx >= 0) { what = rest.slice(0, idx); reason = rest.slice(idx + 2); }
  // "cannot access 'x'" / "cannot remove 'x'" -> x
  const q = /'([^']+)'/.exec(what);
  if (q) what = q[1];
  if (who === 'poweroff') what = 'การปิดเครื่อง';
  for (const [re, why, tip] of REASONS) {
    const mm = re.exec(reason) || re.exec(rest);
    if (mm) {
      const fill = s => s.replace(/\$1/g, mm[1] || what);
      const d = { who, what, why: fill(why), tip: fill(tip), raw: line };
      // cp/mv: say *which side* is missing -- source ("cannot stat") or destination ("cannot create/move")
      if (/^cannot stat/.test(rest) && /No such file/.test(reason)) d.why = 'ไม่มีไฟล์ต้นทางนี้ (ของที่จะก๊อป/ย้าย)';
      if (/^cannot (create|move)/.test(rest) && /No such file|Not a directory/.test(reason)) {
        d.why = 'ไม่มีโฟลเดอร์ปลายทางนี้';
        d.tip = 'เช็กว่าโฟลเดอร์ปลายทางมีอยู่จริง (ls ดู) และ path ถูกต้องเทียบกับที่ที่เราอยู่ตอนนี้';
      }
      // find's first argument is where to START searching, not the name: `find flag.txt` looks for a folder called flag.txt
      if (who === 'find' && /No such file/.test(reason)) {
        d.why = `find ใช้ '${what}' เป็นที่เริ่มค้น แต่ไม่มีที่ชื่อนี้`;
        d.tip = 'find ต้องบอกที่เริ่มค้นก่อน แล้วค่อยบอกชื่อ: find <เริ่มจากไหน> -name <ชื่อไฟล์>  เช่น find . -name notes.txt';
      }
      if (what.startsWith('~')) d.tip = '~ ที่อยู่ใน "..." จะไม่ถูกแปลงเป็นบ้าน (/home/student) กลายเป็นโฟลเดอร์ชื่อ ~ ตรงๆ ให้เอา ~ ไว้นอกเครื่องหมายคำพูด';
      return d;
    }
  }
  if (!who) return null;
  return { who, what, why: '', tip: '', raw: line };
}
