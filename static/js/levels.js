// Level data. The whole game is one machine (initialWorld) that lives through the story: a level's arrive(fs) adds
// what shows up at that point (the virus's doing, work done for ครูสมใจ), and what the player does carries over.
// check(g) looks at the state of the world, not the exact text typed.
// g = { fs, sh, res (last exec result), hist: [results], out: all stdout so far, err: all stderr so far }
import { HOME } from './vfs.js';
import { journal } from './journal.js';

const S = HOME + '/school';

// ---- helpers for checks ----
const ranOk = (g, name, pred = () => true) => g.hist.some(r => r.cmds.some(c => c.name === name && c.code === 0 && pred(c)));
const sawOut = (g, s) => g.hist.some(r => r.stdout.includes(s));
const sawErr = (g, s) => g.hist.some(r => r.stderr.includes(s));
// B3: found the flag, nothing else on screen (`find / 2>/dev/null` alone lists every file -- doesn't count).
const onlyFlag = r => !!r && r.stdout.includes('/var/backups/.old/flag.txt') &&
  r.stdout.trim().split('\n').every(l => l.includes('flag.txt'));
const cleanFlag = r => onlyFlag(r) && r.stderr === '';
// B4: the list has all 3 big downloads and neither small one.
const BIG = ['movie_night.mp4', 'ubuntu.iso', 'old_backup.zip'], SMALL = ['song.mp3', 'homework.pdf'];
const bigOnly = t => !!t && BIG.every(f => t.includes(f)) && !SMALL.some(f => t.includes(f));
const lastOut = g => (g.res ? g.res.stdout.replace(/\x1b\[[0-9;]*m/g, '').trim() : '');

const P1_ALIASES = {
  'การบ้าน': 'homework.txt', 'รูปรุ่น': 'class_photo.jpg', 'รูปหมู่': 'class_photo.jpg',
  'ห้องครู': 'teachers_room', 'ห้องพักครู': 'teachers_room', 'จดหมาย': 'letter.txt',
  'ไวรัส': 'virus.exe', 'เกรด': 'grades (ไฟล์ชื่อมีคำว่า grade อยู่ลึกใน old/)', 'ข้อสอบ': 'exam.txt',
  'ที่หลบภัย': 'backup', 'อัลบั้มรูป': 'photos',
};

const EXAM = 'ข้อสอบกลางภาค วิทยาการคำนวณ ม.4\nข้อ 1. คำสั่งใดใช้ดูรายชื่อไฟล์?\n(ก) ls  (ข) cd  (ค) rm  (ง) ปิดคอมดิ';

export const PHASES = {
  1: { name: 'ภาษาไทยมั่วได้', prompt: 'ภาษาคน>', lam: 'น้องล่ามแข็งแรงเต็มที่ ฟังภาษาไทยได้หมด' },
  2: { name: 'ห้องเรียนน้องล่าม', prompt: 'ฝึก>', lam: 'น้องล่ามโดนกัดมือ สั่งเครื่องแทนไม่ได้แล้ว แต่ยังสอนได้ ถามเป็นภาษาไทย แล้วพิมพ์คำสั่งเอง' },
  3: { name: 'ชื่อจริง ไส้ภาษาคน', prompt: 'cmd>', lam: 'น้องล่ามเสียงแหบ แปลได้แค่ "ไส้ใน"' },
  4: { name: 'เป๊ะทุกตัว', prompt: '$', lam: 'น้องล่ามหลับไปฟื้นพลัง เหลือแค่สมุดถอดรหัส' },
  B: { name: 'ท่อ ถัง และสายพาน', prompt: '$', lam: 'พี่รูทพาลงโรงงานท่อใต้ดิน' },
  R: { name: 'กู้น้องล่าม', prompt: '$', lam: 'ไวรัสลากน้องล่ามไปขังไว้ ไปพาน้องกลับมากัน' },
  5: { name: 'ปลุกน้องล่าม', prompt: '$', lam: 'สามเดือนผ่านไป พี่รูทเจอวิธีปลุกน้องล่ามแล้ว' },
};
// Phases where the player types exact syntax with no AI help (the decoder hides behind a button).
export const STRICT = new Set([4, 'B', 'R', 5]);
export const PHASE_ORDER = [1, 2, 3, 4, 'B', 'R', 5];
export const phaseLabel = ph => ph === 'B' ? 'ด่านสะพาน' : ph === 'R' ? 'ภารกิจกู้ภัย' : ph === 5 ? 'บทสุดท้าย' : 'เฟส ' + ph;

// One sentence per new idea comparing it to what students already do with a mouse on Windows (text in the side
// panel, never spoken, so it needs no voice). Mostly for the bridge and rescue levels, where nobody translates.
export const GUI = {
  '1-2': 'cd = ดับเบิลคลิกเข้าโฟลเดอร์',
  '1-7': '*grade* = พิมพ์ grade ในช่องค้นหาของ File Explorer',
  '1-8': 'sudo = คลิกขวาแล้วเลือก "Run as administrator"',
  '1-9': 'rm = กด Shift+Delete ลบถาวร ไม่ผ่านถังขยะ',
  '2-4': 'lab/notes/day1.txt = ที่อยู่ในแถบบนของ File Explorer (lab > notes > day1.txt)',
  '2-5': '/home/student/... = ที่อยู่เต็มแบบ C:\\Users\\student\\... ใช้ได้จากทุกที่',
  '3-1': 'ls -a = ติ๊ก "Hidden items" (แสดงไฟล์ที่ซ่อน) ใน File Explorer',
  '4-7': '--help = กด F1 หรือเปิดเมนู Help ของโปรแกรม',
  B1: '| = สายพานในโรงงาน ผลของคำสั่งซ้ายส่งต่อให้คำสั่งขวาทำต่อ',
  B2: 'grep = ช่องกรอง เหลือแค่บรรทัดที่มีคำที่ต้องการ',
  B3: '2>/dev/null = โยนคำบ่น (error) ลงถังขยะ จอจะเหลือแต่ผลลัพธ์',
  B4: '> = Save As ลงไฟล์ (ทับของเดิม) ส่วน >> = เขียนต่อท้าย',
  B5: 'xargs rm = เลือกทุกไฟล์ในรายชื่อแล้วกด Delete ทีเดียว',
  R1: 'find / = ค้นหาทั้ง This PC ไม่ใช่แค่โฟลเดอร์เดียว',
  R2: '-print ก่อน -delete = ค้นหาใน Explorer ดูผลให้ครบ แล้วค่อยเลือกทั้งหมดกดลบ',
  R3: 'sudo mv = ตัด (Ctrl+X) แล้ววาง (Ctrl+V) ในฐานะ admin',
  R4: './wake.sh = ดับเบิลคลิกเปิดโปรแกรมที่อยู่ในโฟลเดอร์นี้',
};

export const LEVELS = [
  // ================= PHASE 1 =================
  {
    id: '1-1', phase: 1, cutsceneBefore: 'intro', title: 'ตื่นมาในห้องคอม', place: 'ห้องคอม ม.4/2 — 07:12 น.', cwd: S,
    aliases: P1_ALIASES,
    intro: [
      ['lam', 'เฮ้! เราชื่อน้องล่าม เป็นล่ามประจำเครื่องป้าเซิร์ฟ 🐧'],
      ['lam', 'เมื่อคืนไวรัสมั่วซั่วบุกมา จอเลยเหลือแต่ดำๆ แบบนี้ ไม่ต้องกลัวนะ ที่นี่ลองผิดได้ ไม่มีวันพัง'],
      ['lam', 'บอกเรามาเป็นภาษาไทยเลยว่าอยากทำอะไร เช่น อยากรู้ว่าในห้องนี้มีอะไรบ้าง'],
    ],
    mission: 'สำรวจว่าไวรัสทิ้งอะไรไว้ในห้องนี้บ้าง',
    steps: [['ดูว่าในห้องมีอะไรบ้าง', g => ranOk(g, 'ls')]],
    hint1: ['ls'], solution: 'ls', cards: ['ls'],
    check: g => ranOk(g, 'ls'),
    outro: [['lam', 'เห็นไหม! คำสั่งจริงคือ ls (ย่อมาจาก list) คนใช้ Linux จริงพิมพ์แค่ 2 ตัวนี้เอง ...เอ๊ะ virus.exe คืออะไรน่ะ?!']],
  },
  {
    id: '1-2', target: S + '/teachers_room', phase: 1, title: 'ไปห้องพักครู', place: 'ห้องคอม ม.4/2', cwd: S,
    aliases: P1_ALIASES,
    intro: [['kru', 'ฮัลโหล~ ครูสมใจเองจ้า มาหาครูที่ห้องพักครูหน่อย มีเรื่องด่วน!']],
    mission: 'เข้าไปในห้องพักครู (teachers_room)',
    steps: [['ดูก่อนว่าห้องพักครูอยู่ตรงไหน', g => ranOk(g, 'ls') || g.sh.cwd === S + '/teachers_room'], ['เข้าไปในห้องพักครู', g => g.sh.cwd === S + '/teachers_room']],
    hint1: ['cd'], solution: 'cd teachers_room', cards: ['cd'],
    check: g => g.sh.cwd === S + '/teachers_room',
    outro: [['lam', 'cd ย่อมาจาก change directory = ย้ายไปอยู่ในโฟลเดอร์อื่น สังเกตไหมว่า prompt เปลี่ยนเป็น ~/school/teachers_room แล้ว']],
  },
  {
    id: '1-3', phase: 1, title: 'จดหมายจากครู', place: 'ห้องพักครู', cwd: S + '/teachers_room',
    aliases: P1_ALIASES,
    intro: [['lam', 'ครูไม่อยู่แฮะ แต่มีจดหมายวางไว้บนโต๊ะ ลองให้เราอ่านให้ฟังสิ']],
    mission: 'อ่านจดหมายที่ครูทิ้งไว้',
    steps: [['ดูว่ามีจดหมายอะไรบ้าง', g => ranOk(g, 'ls') || sawOut(g, 'ช่วยด้วย')], ['อ่านจดหมาย', g => sawOut(g, 'ช่วยด้วย')]],
    hint1: ['cat'], solution: 'cat letter.txt', cards: ['cat'],
    check: g => sawOut(g, 'ช่วยด้วย'),
    outro: [['lam', 'cat = แสดงเนื้อหาไฟล์ออกมาบนจอ (มาจาก concatenate แต่จำง่ายๆ ว่าแมวอ่านจดหมายให้ฟัง 🐱)'], ['kru', 'ไฟล์เกรดหายจริงๆ นะ! แต่ก่อนอื่นเก็บไฟล์สำคัญให้ปลอดภัยก่อน']],
  },
  {
    id: '1-4', phase: 1, title: 'สร้างที่หลบภัย', place: 'ห้องคอม ม.4/2', cwd: S,
    aliases: P1_ALIASES,
    intro: [['lam', 'ไวรัสกำลังลาม! เราต้องมีโฟลเดอร์ไว้หลบภัย ตั้งชื่อว่า backup ดีไหม'], ['lam', 'สร้างเสร็จแล้วลองสั่งสร้างซ้ำอีกรอบนะ อยากให้ดูว่าเครื่องจะบ่นว่าอะไร']],
    mission: 'สร้างโฟลเดอร์ชื่อ backup แล้วลองสั่งสร้างซ้ำอีกรอบ ดูว่าเครื่องบ่นว่าอะไร',
    hint1: ['mkdir'], solution: 'mkdir backup  (แล้วสั่งซ้ำอีกที)', cards: ['mkdir'],
    check: g => g.fs.isDir(S + '/backup') && sawErr(g, 'File exists'),
    steps: [['สร้างโฟลเดอร์ backup', g => g.fs.isDir(S + '/backup')], ['สั่งสร้างซ้ำ แล้วดูว่าเครื่องบ่นอะไร', g => sawErr(g, 'File exists')]],
    nudge: g => g.fs.isDir(S + '/backup') && 'สร้างได้แล้ว! ทีนี้ลองสั่งสร้าง backup ซ้ำอีกรอบดูสิ เครื่องจะบ่นว่าอะไร',
    outro: [['lam', 'mkdir = make directory แล้ว error เมื่อกี้อ่านแบบนี้: mkdir (ใครบ่น) : backup (เรื่องอะไร) : File exists (เพราะมีอยู่แล้ว) ง่ายนิดเดียว!']],
  },
  {
    id: '1-5', phase: 1, needs: fs => fs.mkdirp(S + '/backup'), title: 'สำรองการบ้าน', place: 'ห้องคอม ม.4/2', cwd: S,
    aliases: P1_ALIASES,
    intro: [['lam', 'การบ้านของทั้งห้องอยู่ใน homework.txt ก๊อปเก็บไว้ในที่หลบภัยก่อนไวรัสมาแก้!']],
    mission: 'ก๊อปการบ้าน (homework.txt) ไปไว้ในโฟลเดอร์ backup โดยต้นฉบับยังอยู่',
    steps: [['ก๊อป homework.txt ไปไว้ใน backup', g => g.fs.isFile(S + '/backup/homework.txt')], ['ต้นฉบับยังอยู่ที่เดิม', g => g.fs.isFile(S + '/backup/homework.txt') && g.fs.isFile(S + '/homework.txt')]],
    hint1: ['cp'], solution: 'cp homework.txt backup/', cards: ['cp'],
    check: g => g.fs.isFile(S + '/backup/homework.txt') && g.fs.isFile(S + '/homework.txt'),
    fail: g => !g.fs.isFile(S + '/homework.txt') && 'การบ้านต้นฉบับหายไปจากที่เดิม! ภารกิจให้ก๊อป (ต้นฉบับต้องอยู่) ไม่ใช่ย้าย กด "ย้อนเวลา" แล้วลองใหม่',
    outro: [['lam', 'cp = copy ต้องบอกสองอย่างเสมอ: เอาอะไร แล้วไปไว้ที่ไหน']],
  },
  {
    id: '1-6', phase: 1, needs: fs => fs.mkdirp(S + '/photos'), title: 'ย้ายรูปรุ่น', place: 'ห้องคอม ม.4/2', cwd: S,
    aliases: P1_ALIASES,
    intro: [['virus', 'หึหึ... รูปรุ่นนี่ดูน่าอร่อยจัง 👾'], ['lam', 'ไม่นะ! ย้ายรูปรุ่นไปไว้ในอัลบั้ม photos ด่วน!']],
    mission: 'ย้ายรูปรุ่น (class_photo.jpg) ไปไว้ในโฟลเดอร์ photos',
    steps: [['รูปไปอยู่ใน photos แล้ว', g => g.fs.isFile(S + '/photos/class_photo.jpg')], ['ที่เดิมไม่เหลือรูปแล้ว (ย้าย ไม่ใช่ก๊อป)', g => g.fs.isFile(S + '/photos/class_photo.jpg') && !g.fs.exists(S + '/class_photo.jpg')]],
    hint1: ['mv'], solution: 'mv class_photo.jpg photos/', cards: ['mv'],
    check: g => g.fs.isFile(S + '/photos/class_photo.jpg') && !g.fs.exists(S + '/class_photo.jpg'),
    nudge: g => g.fs.isFile(S + '/photos/class_photo.jpg') && g.fs.exists(S + '/class_photo.jpg') && 'ก๊อปไปไว้ใน photos แล้ว แต่รูปต้นฉบับยังวางอยู่ที่เดิมให้ไวรัสกิน! ก๊อป = ของเดิมยังอยู่ ภารกิจนี้ต้อง "ย้าย"',
    outro: [['lam', 'mv = move ต่างจาก cp ตรงที่ของเดิมหายไปจากที่เก่าเลย']],
  },
  {
    id: '1-7', phase: 1, title: 'ตามหาไฟล์เกรด', place: 'ห้องคอม ม.4/2', cwd: S,
    aliases: P1_ALIASES,
    intro: [['kru', 'ไฟล์เกรดของครูชื่อมีคำว่า grade อยู่ แต่ไวรัสซ่อนไว้ลึกมาก หาให้ครูหน่อยนะ']],
    mission: 'หาไฟล์เกรดของครู (ชื่อมีคำว่า grade) ว่าซ่อนอยู่ตรงไหน',
    steps: [['ค้นหาไฟล์ที่ชื่อมี grade', g => sawOut(g, 'grades.txt')], ['รู้ว่าไฟล์ซ่อนอยู่ในโฟลเดอร์ไหน (เห็นที่อยู่เต็มๆ)', g => sawOut(g, 'old/2569/term1/grades.txt')]],
    hint1: ['find', '-name'], solution: 'find . -name "*grade*"', cards: ['find'],
    check: g => sawOut(g, 'old/2569/term1/grades.txt'),
    outro: [['kru', 'เจอแล้ว! อยู่ที่ old/2569/term1/grades.txt นี่เอง ขอบใจมากจ้า'], ['lam', 'find = ค้นหา *grade* แปลว่า "อะไรก็ได้ที่มีคำว่า grade อยู่ตรงกลาง"']],
  },
  {
    id: '1-8', phase: 1, title: 'ห้องข้อสอบลับ', place: 'ห้องพักครู', cwd: S + '/teachers_room', password: 'pass123',
    aliases: P1_ALIASES,
    intro: [
      ['kru', 'ไวรัสอาจแก้ข้อสอบพรุ่งนี้! ช่วยเช็กไฟล์ exam.txt ให้ครูที'],
      ['root', 'หวัดดี พี่รูทเอง ม.6 ผู้ดูแลระบบ ไฟล์นั้นล็อกไว้ อ่านได้แค่แอดมิน ถ้าโดนปฏิเสธก็ขอใช้สิทธิ์แอดมินนะ รหัสผ่านคือ pass123'],
    ],
    mission: 'อ่านไฟล์ข้อสอบ exam.txt (ถ้าไม่มีสิทธิ์ ให้ขอใช้สิทธิ์แอดมิน รหัส pass123)',
    steps: [['ลองอ่าน exam.txt', g => sawErr(g, 'Permission denied') || sawOut(g, 'ข้อสอบกลางภาค')], ['ใช้สิทธิ์แอดมินอ่านให้ได้', g => sawOut(g, 'ข้อสอบกลางภาค')]],
    hint1: ['cat', 'sudo'], solution: 'sudo cat exam.txt   (รหัส pass123)', cards: ['sudo'],
    check: g => sawOut(g, 'ข้อสอบกลางภาค'),
    outro: [['root', 'sudo = "ทำในนามแอดมิน" ตอนพิมพ์รหัสจะไม่มีอะไรขึ้นจอ เป็นเรื่องปกติ พลังมากต้องรับผิดชอบมากนะน้อง']],
  },
  {
    id: '1-9', phase: 1, boss: true, title: 'มินิบอส: ปิดคอมดิ!', place: 'ห้องคอม ม.4/2', cwd: S, password: 'pass123',
    aliases: P1_ALIASES,
    intro: [
      ['virus', 'ข้ายังอยู่! virus.exe จะกินเครื่องนี้ทั้งเครื่อง 👾👾'],
      ['lam', 'ลบไวรัสทิ้ง แล้วปิดเครื่องตัดการเชื่อมต่อเลย! (ปิดเครื่องต้องใช้สิทธิ์แอดมินนะ รหัส pass123)'],
    ],
    mission: 'ลบ virus.exe แล้วปิดเครื่อง',
    hint1: ['rm', 'sudo', 'poweroff'], solution: 'rm virus.exe  แล้ว  sudo poweroff', cards: ['rm', 'poweroff'],
    check: g => !g.fs.exists(S + '/virus.exe') && g.sh.flags.poweroff,
    steps: [['ลบ virus.exe', g => !g.fs.exists(S + '/virus.exe')], ['ปิดเครื่อง', g => g.sh.flags.poweroff]],
    outro: [['lam', 'รอดแล้ว!! rm = remove (ลบแล้วหายเลย ไม่มีถังขยะ) poweroff = ปิดเครื่อง ครบ 10 คำสั่งแล้ว เก่งมาก!'], ['virus', '...ข้าจะกลับมา และคราวหน้าข้าจะกัดล่ามของเจ้า 👾']],
  },

  // ================= PHASE 2: ห้องเรียนน้องล่าม =================
  // น้องล่าม can't run anything any more, only teach: say what you want in Thai, get the command with every part
  // explained, then type it yourself. One idea per level, everything phase 3 relies on.
  {
    id: '2-1', phase: 2, title: 'เปิดไฟดูห้อง', place: 'เช้าวันที่สอง — ตึกเรียน', cwd: S,
    arrive: fs => bite(fs, 'วันที่สอง: ไวรัสกัดมือ — สั่งเครื่องแทนเพื่อนไม่ได้แล้ว แต่ยังสอนได้'),
    intro: [
      ['virus', 'ข้ากัดมือล่ามไปแล้ว! ต่อไปนี้มันสั่งเครื่องแทนเจ้าไม่ได้อีก 👾'],
      ['lam', 'แง... เรากดคำสั่งเองไม่ได้แล้ว แต่ยังสอนได้นะ! บอกเป็นภาษาไทยว่าอยากทำอะไร เราจะบอกคำสั่งพร้อมอธิบายทุกส่วน แล้วเธอพิมพ์เอง'],
      ['lam', 'เริ่มจากง่ายสุด: ลองถามเราว่า "ดูไฟล์ในห้องนี้" แล้วพิมพ์ตามดูสิ'],
    ],
    mission: 'ดูว่าในห้องนี้มีอะไรบ้าง (ถามน้องล่ามได้ แต่ต้องพิมพ์คำสั่งเอง)',
    steps: [['ดูของในห้องด้วยคำสั่งจริง', g => ranOk(g, 'ls')]],
    hint1: ['ls'], solution: 'ls', cards: [],
    check: g => ranOk(g, 'ls'),
    outro: [['lam', 'ls มาจาก list = รายการ สีฟ้าคือ "ห้อง" (โฟลเดอร์) เข้าไปข้างในได้ สีขาวคือ "ของ" (ไฟล์) เปิดอ่านได้']],
  },
  {
    id: '2-2', phase: 2, title: 'ตอนนี้เราอยู่ไหน', place: 'ตึกเรียน', cwd: S,
    intro: [['lam', 'ในเครื่องมีห้องซ้อนห้องเป็นร้อย หลงง่ายมาก ลองถามเครื่องดูว่าตอนนี้เรายืนอยู่ตรงไหน']],
    mission: 'ถามเครื่องว่าตอนนี้เราอยู่ที่ไหน (ที่อยู่เต็ม)',
    steps: [['ถามที่อยู่ปัจจุบัน', g => ranOk(g, 'pwd')]],
    hint1: ['pwd'], solution: 'pwd', cards: ['pwd'],
    check: g => ranOk(g, 'pwd'),
    outro: [
      ['lam', 'pwd = print working directory บอกที่อยู่เต็ม /home/student/school อ่านจากซ้ายไปขวาเหมือนเดินเข้าห้องซ้อนกัน'],
      ['lam', '/ ตัวแรกสุดคือ "ราก" จุดเริ่มของทั้งเครื่อง แล้วเดินเข้า home → student → school ส่วน ~ ใน prompt คือชื่อย่อของ /home/student (บ้านของเรา)'],
    ],
  },
  {
    id: '2-3', phase: 2, title: 'เดินเข้า ถอยออก', place: 'ตึกเรียน', cwd: S,
    intro: [['lam', 'ลองเดินเข้าห้องแล็บ (lab) แล้วถอยกลับออกมาที่เดิม ถ้าไม่รู้คำสั่ง ถามเราได้เลย']],
    mission: 'เข้าไปในห้อง lab แล้วถอยกลับออกมาที่ school',
    steps: [
      ['เข้าไปในห้อง lab', g => g.hist.some(r => r.cwd === S + '/lab')],
      ['ถอยกลับออกมาหนึ่งชั้น', g => g.hist.some(r => r.cwd === S + '/lab') && g.sh.cwd === S],
    ],
    hint1: ['cd', 'cd ..'], solution: 'cd lab → cd ..', cards: ['cd ..'],
    check: g => g.hist.some(r => r.cwd === S + '/lab') && g.sh.cwd === S,
    outro: [['lam', '.. (จุดสองตัว) = ห้องที่ใหญ่กว่าหนึ่งชั้น ส่วน . (จุดเดียว) = ห้องที่เรายืนอยู่ตอนนี้ จำสองตัวนี้ไว้ ใช้บ่อยมาก']],
  },
  {
    id: '2-4', phase: 2, title: 'อ่านโดยไม่ต้องเดินไป', place: 'ตึกเรียน', cwd: S,
    intro: [['lam', 'บันทึก day1.txt อยู่ในห้อง notes ซึ่งอยู่ในห้อง lab อีกที ไม่ต้องเดินเข้าไปก็อ่านได้ ถ้าบอกทางให้ถูก']],
    mission: 'อ่านไฟล์ day1.txt ที่อยู่ใน lab/notes โดยยืนอยู่ที่ school (ไม่ต้อง cd)',
    steps: [['อ่าน day1.txt จากตรงนี้เลย', g => g.hist.some(r => r.stdout.includes('บันทึกวันที่ 1') && r.cwd === S)]],
    hint1: ['cat', 'lab/notes/day1.txt'], solution: 'cat lab/notes/day1.txt', cards: ['path'],
    check: g => g.hist.some(r => r.stdout.includes('บันทึกวันที่ 1') && r.cwd === S),
    nudge: g => sawOut(g, 'บันทึกวันที่ 1') && g.sh.cwd !== S && 'อ่านได้แล้ว! แต่ด่านนี้อยากให้ลองบอกทางจากที่ school เลย ถอยกลับไปก่อน แล้วใช้ / คั่นชื่อห้องทีละชั้น',
    outro: [['lam', '/ ตรงกลางแปลว่า "เข้าไปใน" lab/notes/day1.txt = ห้อง lab → ห้อง notes → ไฟล์ day1.txt แบบนี้เรียกว่า path (เส้นทาง)']],
  },
  {
    id: '2-5', phase: 2, target: S + '/library', title: 'ที่อยู่เต็ม', place: 'ลึกในห้องแล็บ', cwd: S + '/lab/notes',
    intro: [['lam', 'ตอนนี้เราอยู่ลึกในห้องแล็บ อยากไปห้องสมุด ถ้าจำที่อยู่เต็มได้ ไปได้ทันทีจากทุกที่ ไม่ต้องถอยทีละชั้น']],
    mission: 'ไปที่ห้องสมุดด้วยที่อยู่เต็ม /home/student/school/library (ขึ้นต้นด้วย /)',
    steps: [
      ['ใช้ที่อยู่เต็มที่ขึ้นต้นด้วย / (หรือ ~)', g => ranOk(g, 'cd', c => /^[\/~]/.test(c.args[0] || ''))],
      ['ถึงห้องสมุดแล้ว', g => g.sh.cwd === S + '/library'],
    ],
    hint1: ['cd', '/home/student/school/library'], solution: 'cd /home/student/school/library', cards: ['/ ที่อยู่เต็ม'],
    check: g => g.sh.cwd === S + '/library' && ranOk(g, 'cd', c => /^[\/~]/.test(c.args[0] || '')),
    nudge: g => g.sh.cwd === S + '/library' && 'ถึงแล้ว แต่ด่านนี้อยากให้ลองแบบที่อยู่เต็มที่ขึ้นต้นด้วย / ดูสักครั้ง',
    outro: [['lam', 'ขึ้นต้นด้วย / = นับจากรากเสมอ ใช้ได้จากทุกที่ ไม่ขึ้นต้นด้วย / = นับจากห้องที่อยู่ตอนนี้ และ ~/school/library ก็ได้ผลเดียวกัน เพราะ ~ = /home/student']],
  },
  {
    id: '2-6', phase: 2, title: 'ตัวเลือกหน้าขีด', place: 'ห้องชมรม', cwd: S,
    intro: [
      ['kru', 'ก๊อปโฟลเดอร์ club ทั้งโฟลเดอร์เก็บไว้เป็น club_bak หน่อยจ้า'],
      ['lam', 'ลอง cp แบบธรรมดาก่อนก็ได้ ดูซิเครื่องจะบ่นว่าอะไร แล้วถามเราว่าแก้ยังไง'],
    ],
    mission: 'ก๊อปโฟลเดอร์ club ทั้งโฟลเดอร์ไปเป็น club_bak',
    steps: [
      ['มีโฟลเดอร์ club_bak แล้ว', g => g.fs.isDir(S + '/club_bak')],
      ['ข้างในมีของครบทุกชั้น', g => g.fs.isFile(S + '/club_bak/robots/arm.txt')],
      ['club ตัวจริงยังอยู่ (ก๊อป ไม่ใช่ย้าย)', g => g.fs.isFile(S + '/club_bak/robots/arm.txt') && g.fs.isFile(S + '/club/robots/arm.txt')],
    ],
    hint1: ['cp', '-r'], solution: 'cp -r club club_bak', cards: ['-ตัวเลือก'],
    check: g => g.fs.isFile(S + '/club_bak/robots/arm.txt') && g.fs.isFile(S + '/club_bak/members.txt') && g.fs.isFile(S + '/club/robots/arm.txt'),
    fail: g => !g.fs.exists(S + '/club') && 'club หายไปจากที่เดิมแล้ว นั่นคือการย้าย (mv) แต่ภารกิจคือก๊อป (cp) กด "ย้อนเวลา"',
    outro: [['lam', 'อะไรที่ขึ้นต้นด้วย - คือ "ตัวเลือก" เปลี่ยนวิธีทำงานของคำสั่ง -r = recursive = ลงไปทุกชั้น ใช้ได้ทั้ง cp และ rm ดูตัวเลือกทั้งหมดได้ด้วย --help']],
  },
  {
    id: '2-7', phase: 2, title: 'ย้าย = เปลี่ยนชื่อ', place: 'ห้องชมรม', cwd: S,
    arrive: fs => rename(fs, S + '/report.txt', S + '/rpeort.txt'),   // the virus swaps two letters
    intro: [['virus', 'ข้าสลับตัวอักษรชื่อรายงานเล่น อ่านออกไหมล่ะ 👾'], ['lam', 'rpeort.txt ต้องเป็น report.txt! ใน Linux ไม่มีคำสั่ง "เปลี่ยนชื่อ" แยก ลองถามเราดู']],
    mission: 'เปลี่ยนชื่อ rpeort.txt เป็น report.txt',
    steps: [
      ['มี report.txt แล้ว', g => g.fs.isFile(S + '/report.txt')],
      ['rpeort.txt ชื่อผิดไม่เหลือแล้ว', g => g.fs.isFile(S + '/report.txt') && !g.fs.exists(S + '/rpeort.txt')],
    ],
    hint1: ['mv'], solution: 'mv rpeort.txt report.txt', cards: [],
    check: g => g.fs.isFile(S + '/report.txt') && !g.fs.exists(S + '/rpeort.txt'),
    nudge: g => g.fs.isFile(S + '/report.txt') && g.fs.exists(S + '/rpeort.txt') && 'มี report.txt แล้ว แต่ rpeort.txt ก็ยังอยู่ ก๊อปไม่ใช่เปลี่ยนชื่อนะ',
    outro: [['lam', 'mv = move ย้ายของไปไว้ "ที่เดิมแต่ชื่อใหม่" ก็คือการเปลี่ยนชื่อนั่นเอง']],
  },
  {
    id: '2-8', phase: 2, title: 'ค้นหาแบบมือโปร', place: 'ตึกเรียน', cwd: S,
    intro: [['kru', 'ไฟล์เกรดชื่อมีคำว่า grade ซ่อนอยู่ลึกมาก ช่วยหาให้ครูทีจ้า'], ['lam', 'คำสั่งค้นหามีหลายส่วน ถามเราแล้วอ่านคำอธิบายทีละส่วนนะ']],
    mission: 'ค้นหาไฟล์ที่ชื่อมีคำว่า grade ในตึกนี้ (ทุกห้องข้างใน)',
    steps: [['ค้นหาจนเห็นที่อยู่ของไฟล์เกรด', g => sawOut(g, 'old/2569/term1/grades.txt')]],
    hint1: ['find', '.', '-name', '"*grade*"'], solution: 'find . -name "*grade*"', cards: ['find -name'],
    check: g => sawOut(g, 'old/2569/term1/grades.txt'),
    outro: [
      ['lam', 'find = ค้น . = เริ่มจากห้องนี้ (และทุกห้องข้างใน) -name = ค้นจากชื่อ'],
      ['lam', '"*grade*" = ชื่ออะไรก็ได้ที่มี grade อยู่ * แปลว่า "อะไรก็ได้" และครอบด้วย "..." เพื่อให้ find ได้ดอกจันไปใช้เอง'],
    ],
  },
  {
    id: '2-9', phase: 2, boss: true, title: 'มินิบอส: ไล่ไวรัสจากโรงยิม', place: 'โรงยิม', cwd: S, password: 'pass123',
    arrive: fs => fs.write(S + '/gym/locker_12/mua_king.bin', '👑👾'),
    intro: [
      ['virus', 'ราชาไวรัสซ่อนอยู่ในโรงยิม หาข้าให้เจอสิ! 👑👾'],
      ['lam', 'ทบทวนทั้งเฟส: หาไฟล์ที่ชื่อมี mua → เดินไปที่ห้องนั้น → ลบมัน → ปิดเครื่อง (ใช้สิทธิ์แอดมิน รหัส pass123)'],
    ],
    mission: 'หาไฟล์ไวรัส (ชื่อมีคำว่า mua) ลบมัน แล้วปิดเครื่อง',
    steps: [
      ['หาว่าไฟล์ไวรัสอยู่ไหน', g => sawOut(g, 'mua_king.bin')],
      ['ลบไฟล์ไวรัส', g => !g.fs.exists(S + '/gym/locker_12/mua_king.bin')],
      ['ปิดเครื่อง', g => g.sh.flags.poweroff],
    ],
    hint1: ['find', 'cd', 'rm', 'sudo poweroff'], solution: 'find . -name "*mua*" → rm gym/locker_12/mua_king.bin → sudo poweroff', cards: [],
    check: g => !g.fs.exists(S + '/gym/locker_12/mua_king.bin') && g.fs.isFile(S + '/gym/locker_01/shoes.txt') && g.sh.flags.poweroff,
    fail: g => !g.fs.exists(S + '/gym/locker_01/shoes.txt') && 'ของในล็อกเกอร์อื่นหายไปด้วย! กด "ย้อนเวลา"',
    outro: [['lam', 'เฟสนี้เธอรู้แล้วว่าแต่ละคำสั่ง แต่ละส่วนคืออะไรจริงๆ'], ['virus', 'หนอย... คราวนี้ข้ากัดเสียงล่ามแน่ 👾']],
  },

  // ================= PHASE 3 =================
  {
    id: '3-1', phase: 3, title: 'รังลับหลังเวที', place: 'ห้องเก็บของหลังเวที', cwd: S + '/stage',
    arrive: fs => { fs.tree(S + '/stage/.virus_nest', { 'egg.mua': '👾' }); bite(fs, 'ไวรัสกัดเสียง — แปลได้แค่ไส้ในของคำสั่ง'); },
    intro: [['lam', '(เสียงแหบ) เราแปลได้แค่ "ไส้ใน" แล้วนะ ชื่อคำสั่งต้องพิมพ์เองเท่านั้น'], ['lam', 'ไวรัสซ่อนรังไว้ในห้องนี้ ลองดูไฟล์ที่ซ่อนอยู่สิ']],
    mission: 'ดูรายชื่อไฟล์ รวมไฟล์ที่ซ่อนอยู่ด้วย',
    steps: [['ดูไฟล์ในห้อง', g => ranOk(g, 'ls')], ['เห็นไฟล์ที่ซ่อนอยู่ด้วย', g => sawOut(g, '.virus_nest')]],
    hint1: ['ls', '-a'], solution: 'ls -a', cards: ['ls -a'],
    check: g => sawOut(g, '.virus_nest'),
    outro: [['lam', 'ไฟล์ที่ชื่อขึ้นต้นด้วยจุดคือไฟล์ซ่อน! -a = all']],
  },
  {
    id: '3-2', target: HOME, phase: 3, title: 'ทางกลับบ้าน', place: 'ลึกในกองชุดละคร', cwd: S + '/stage/costumes/hats/red',
    intro: [['lam', 'หลงเข้ามาลึกเกิน! ลองถอยออกไปทีละชั้น หรือกลับบ้านทีเดียวเลยก็ได้']],
    mission: 'กลับบ้าน (~)',
    steps: [['กลับบ้าน (~)', g => g.sh.cwd === HOME]],
    hint1: ['cd ..', 'cd ~'], solution: 'cd ~', cards: ['cd ..'],
    check: g => g.sh.cwd === HOME,
    outro: [['lam', 'cd .. = ถอยหนึ่งชั้น, cd ~ หรือ cd เฉยๆ = กลับบ้าน']],
  },
  {
    id: '3-3', phase: 3, title: 'ตู้เอกสารซ้อนชั้น', place: 'ห้องธุรการ', cwd: S,
    intro: [['kru', 'ครูอยากได้โฟลเดอร์ projects/2569/science ไว้เก็บโครงงาน']],
    mission: 'สร้างโฟลเดอร์ projects/2569/science (ซ้อนหลายชั้น)',
    steps: [['มี projects', g => g.fs.isDir(S + '/projects')], ['มี projects/2569', g => g.fs.isDir(S + '/projects/2569')], ['มี projects/2569/science', g => g.fs.isDir(S + '/projects/2569/science')]],
    hint1: ['mkdir', '-p'], solution: 'mkdir -p projects/2569/science', cards: ['mkdir -p'],
    check: g => g.fs.isDir(S + '/projects/2569/science'),
    outro: [['lam', '-p = parents สร้างชั้นที่ขาดให้ครบในทีเดียว']],
  },
  {
    id: '3-4', phase: 3, needs: fs => fs.mkdirp(S + '/backup'), title: 'ถ่ายเอกสารทั้งตู้', place: 'ห้องชมรม', cwd: S,
    intro: [['lam', 'สำรองงานชมรมทั้งโฟลเดอร์เข้า backup กัน']],
    mission: 'ก๊อปโฟลเดอร์ club ทั้งโฟลเดอร์ไปไว้ใน backup',
    steps: [['มี club อยู่ใน backup แล้ว', g => g.fs.isDir(S + '/backup/club')], ['ข้างในครบทุกชั้น', g => g.fs.isFile(S + '/backup/club/robots/arm.txt')], ['club ตัวจริงยังอยู่ที่เดิม (ก๊อป ไม่ใช่ย้าย)', g => g.fs.isFile(S + '/backup/club/robots/arm.txt') && g.fs.isFile(S + '/club/robots/arm.txt')]],
    hint1: ['cp', '-r'], solution: 'cp -r club backup/', cards: ['cp -r'],
    check: g => g.fs.isFile(S + '/backup/club/robots/arm.txt') && g.fs.isFile(S + '/club/robots/arm.txt'),
    fail: g => !g.fs.exists(S + '/club') && 'club หายไปจากที่เดิมแล้ว นั่นคือการย้าย (mv) แต่ภารกิจคือก๊อป (cp) ของเดิมต้องอยู่ กด "ย้อนเวลา"',
    outro: [['lam', 'ทั้งโฟลเดอร์ = -r จำไว้ใช้ได้ทั้ง cp และ rm']],
  },
  {
    id: '3-5', phase: 3, title: 'ป้ายชื่อผิด', place: 'ห้องธุรการ', cwd: S,
    arrive: fs => rename(fs, S + '/science_report.txt', S + '/science_report.exe'),
    intro: [['virus', 'ข้าเปลี่ยนนามสกุลรายงานวิทยาศาสตร์เป็น .exe ให้ดูน่ากลัวเล่น 👾']],
    mission: 'เปลี่ยนชื่อ science_report.exe กลับเป็น science_report.txt',
    steps: [['มี science_report.txt แล้ว', g => g.fs.isFile(S + '/science_report.txt')], ['science_report.exe ไม่เหลือแล้ว', g => g.fs.isFile(S + '/science_report.txt') && !g.fs.exists(S + '/science_report.exe')]],
    hint1: ['mv'], solution: 'mv science_report.exe science_report.txt', cards: [],
    check: g => g.fs.isFile(S + '/science_report.txt') && !g.fs.exists(S + '/science_report.exe'),
    nudge: g => g.fs.isFile(S + '/science_report.txt') && g.fs.exists(S + '/science_report.exe') && 'มี science_report.txt แล้ว แต่ .exe ยังอยู่ เปลี่ยนชื่อ = ของเดิมต้องไม่เหลือ',
    outro: [['lam', 'รู้ไหม นามสกุลไม่ได้กำหนดชนิดไฟล์ใน Linux มันเป็นแค่ส่วนหนึ่งของชื่อ']],
  },
  {
    id: '3-6', phase: 3, title: 'นักสืบขนาดไฟล์', place: 'ห้องเก็บของ', cwd: S + '/storage',
    arrive: fs => fs.tree(S + '/storage', { 'junk1.iso': { content: '\x00junk', size: 734_003_200 }, 'junk2.mp4': { content: '\x00junk', size: 125_829_120 } }),
    intro: [['kru', 'ดิสก์เต็ม! ครูเซฟงานไม่ได้เลย ไวรัสปั๊มไฟล์ใหญ่ๆ ไว้แน่ๆ'], ['lam', 'ลองหาไฟล์ที่ใหญ่เกิน 50MB ดูก่อน ยังไม่ต้องลบนะ']],
    mission: 'ค้นหาไฟล์ที่ใหญ่เกิน 50MB',
    steps: [['ค้นหาเฉพาะไฟล์ที่ใหญ่เกิน 50MB (ไม่มีไฟล์เล็กปน)', g => g.hist.some(r => ['junk1.iso', 'junk2.mp4', 'yearbook_video.mp4'].every(f => r.stdout.includes(f)) && !['poster.png', 'notes.txt'].some(f => r.stdout.includes(f)))]],
    hint1: ['find', '-size', '-type'], solution: 'find . -type f -size +50M', cards: ['find -size'],
    // One command's output must list exactly the big ones: plain `ls` shows everything, so it doesn't count.
    check: g => g.hist.some(r => ['junk1.iso', 'junk2.mp4', 'yearbook_video.mp4'].every(f => r.stdout.includes(f)) &&
      !['poster.png', 'notes.txt'].some(f => r.stdout.includes(f))),
    nudge: g => ['poster.png', 'notes.txt'].some(f => g.res.stdout.includes(f)) &&
      'ls โชว์ทุกไฟล์ ทั้งเล็กทั้งใหญ่เลย ภารกิจคือกรองให้เหลือแค่ไฟล์ที่ใหญ่เกิน 50MB นะ',
    outro: [['lam', '-size +50M = ใหญ่เกิน 50MB เจอ 3 ไฟล์ ...แต่เดี๋ยวนะ yearbook_video.mp4 นี่มันวิดีโอรุ่นนี่!']],
  },
  {
    id: '3-7', phase: 3, title: 'ลบไฟล์ใหญ่ (ดูก่อนลบ)', place: 'ห้องเก็บของ', cwd: S + '/storage',
    intro: [['kru', 'ลบไฟล์ขยะใหญ่ๆ ให้ครูทีนะ'], ['lam', 'ก่อนลบเราจะโชว์รายชื่อให้ดูก่อนทุกครั้ง อ่านดีๆ ก่อนกด y นะ']],
    mission: 'ลบไฟล์ขยะที่ใหญ่เกิน 50MB แต่ห้ามลบวิดีโอรุ่น (yearbook_video.mp4)',
    steps: [['ลบ junk1.iso', g => !g.fs.exists(S + '/storage/junk1.iso')], ['ลบ junk2.mp4', g => !g.fs.exists(S + '/storage/junk2.mp4')], ['วิดีโอรุ่นยังอยู่', g => !g.fs.exists(S + '/storage/junk1.iso') && !g.fs.exists(S + '/storage/junk2.mp4') && g.fs.exists(S + '/storage/yearbook_video.mp4')]],
    hint1: ['rm', 'find -delete'], solution: 'rm junk1.iso junk2.mp4', cards: [],
    check: g => !g.fs.exists(S + '/storage/junk1.iso') && !g.fs.exists(S + '/storage/junk2.mp4') && g.fs.exists(S + '/storage/yearbook_video.mp4'),
    fail: g => !g.fs.exists(S + '/storage/yearbook_video.mp4') && 'วิดีโอรุ่นหายไปแล้ว!! บนเครื่องจริงไม่มีปุ่มย้อนเวลานะ กด "ย้อนเวลา" แล้วลองใหม่',
    outro: [['lam', 'เยี่ยม! "ดูก่อนลบ" คือนิสัยมือโปร คำสั่งแบบมือโปรคือ find . -type f -size +50M -name "junk*" -delete']],
  },
  {
    id: '3-8', phase: 3, boss: true, lamSleeps: true, title: 'มินิบอส: ห้องเซิร์ฟเวอร์', place: 'หน้าห้องเซิร์ฟเวอร์', cwd: S, password: 'pass123',
    arrive: fs => { fs.write(S + '/server_room/mua.bin', '👾👾👾'); fs.write(S + '/server_room/system.log', SYSLOG + '\n07:02 ERROR ไฟล์แปลกปลอมชื่อ mua.bin กำลังกิน CPU 99%\n07:03 ERROR mua.bin copy ตัวเองไปทั่ว'); },
    intro: [['root', 'ห้องเซิร์ฟเวอร์เป็นของ root ดูได้ แต่แก้ต้องใช้ sudo (รหัส pass123)'], ['lam', 'เข้าไปอ่าน log หาชื่อไวรัส ลบมัน แล้วปิดเครื่อง!']],
    mission: 'เข้าห้องเซิร์ฟเวอร์ อ่าน system.log หาชื่อไวรัส ลบมัน แล้วปิดเครื่อง',
    hint1: ['cd', 'cat', 'sudo rm', 'sudo poweroff'], solution: 'cd server_room → cat system.log → sudo rm mua.bin → sudo poweroff', cards: [],
    check: g => !g.fs.exists(S + '/server_room/mua.bin') && g.fs.exists(S + '/server_room/router.cfg') && g.sh.flags.poweroff,
    steps: [['อ่าน system.log', g => sawOut(g, 'กำลังกิน CPU')], ['ลบไฟล์ไวรัส', g => !g.fs.exists(S + '/server_room/mua.bin')], ['ปิดเครื่อง', g => g.sh.flags.poweroff]],
    fail: g => !g.fs.exists(S + '/server_room/router.cfg') && 'ลบ router.cfg ไปด้วย เน็ตทั้งโรงเรียนล่ม! กด "ย้อนเวลา"',
    outro: [['virus', 'อ๊าก! แต่ข้ากัดล่ามจนหลับไปแล้ว คราวนี้เจ้าต้องสู้คนเดียว 👾'], ['lam', 'ง่วง... จัง... ฝากสมุดไว้นะ... zzZ']],
  },

  // ================= PHASE 4 =================
  {
    id: '4-1', phase: 4, title: 'สะกดผิดนิดเดียว', place: 'คืนก่อนสอบ — ห้องคอมปิดไฟ', cwd: S,
    arrive: fs => bite(fs, 'คืนห้องเซิร์ฟเวอร์: ไวรัสกัดโมดูลล่าม — หลับไป (ดู last_log.dat)'),
    intro: [
      ['root', 'น้องล่ามหลับไปฟื้นพลังแล้ว เหลือแต่สมุดถอดรหัสทิ้งไว้ (ปุ่ม 📖 ใต้ error)'],
      ['root', 'จากนี้ไม่มีใครแปลให้ พิมพ์ผิดก็จะเห็นแบบที่คนใช้ Linux จริงเห็น ตัวเลขใน [ ] คือ exit code: 0 = สำเร็จ'],
      ['root', 'ลองก่อนเลย: ดูว่าในห้องมีอะไร'],
    ],
    mission: 'ดูว่าในห้องมีอะไรบ้าง (พิมพ์คำสั่งจริงเอง)',
    steps: [['ดูว่าในห้องมีอะไรบ้าง', g => ranOk(g, 'ls')]],
    hint1: ['ls'], solution: 'ls', cards: [],
    check: g => ranOk(g, 'ls'),
    outro: [['root', '127 แปลว่า "ไม่มีคำสั่งนี้ในโลก" และ Linux แยกตัวเล็กตัวใหญ่ LS กับ ls ไม่เหมือนกัน']],
  },
  {
    id: '4-2', phase: 4, title: 'ไฟล์ชื่อมีช่องว่าง', place: 'ห้องพักครู', cwd: S + '/teachers_room',
    intro: [['kru', 'ครูตั้งชื่อไฟล์ว่า my notes.txt มีช่องว่างด้วยนะ อ่านให้ครูที']],
    mission: 'อ่านไฟล์ my notes.txt',
    steps: [['ดูชื่อไฟล์ในห้อง', g => ranOk(g, 'ls') || sawOut(g, 'พรุ่งนี้สอบ')], ['อ่าน my notes.txt', g => sawOut(g, 'พรุ่งนี้สอบ')]],
    hint1: ['cat', '"..."'], solution: 'cat "my notes.txt"', cards: ['"ชื่อมีช่องว่าง"'],
    check: g => sawOut(g, 'พรุ่งนี้สอบ'),
    outro: [['root', 'ช่องว่างแบ่งคำ cat เลยนึกว่ามี 2 ไฟล์ my กับ notes.txt ครอบด้วย "..." ให้เป็นชื่อเดียว']],
  },
  {
    id: '4-3', target: S + '/exam_room2', phase: 4, title: 'ประตูหลอก', place: 'ทางเดินห้องสอบ', cwd: S,
    arrive: fs => fs.write(S + '/exam_room', 'ฮ่าๆ ประตูหลอก! นี่คือไฟล์ ไม่ใช่ห้อง — ไวรัสมั่วซั่ว'),
    intro: [['virus', 'ห้องสอบอยู่ทางนี้~ เชิญเข้ามาเลย 👾']],
    mission: 'เข้าไปในห้องสอบตัวจริง',
    steps: [['ดูว่าทางเดินมีอะไรบ้าง', g => ranOk(g, 'ls') || g.sh.cwd === S + '/exam_room2'], ['เข้าห้องสอบตัวจริง', g => g.sh.cwd === S + '/exam_room2']],
    hint1: ['cd', 'ls'], solution: 'cd exam_room2', cards: [],
    check: g => g.sh.cwd === S + '/exam_room2',
    outro: [['root', 'Not a directory = อันนั้นเป็นไฟล์ เข้าไปข้างในไม่ได้ ls ดูก่อนช่วยได้เยอะ (โฟลเดอร์จะเป็นสีฟ้า)']],
  },
  {
    id: '4-4', phase: 4, title: 'สร้างแต่ลืมตั้งชื่อ', place: 'ห้องธุรการ', cwd: S,
    intro: [['kru', 'เตรียมโฟลเดอร์ส่งงาน submit/m4/room2 ให้ห้อง ม.4/2 หน่อยจ้า']],
    mission: 'สร้างโฟลเดอร์ submit/m4/room2',
    steps: [['มี submit', g => g.fs.isDir(S + '/submit')], ['มี submit/m4', g => g.fs.isDir(S + '/submit/m4')], ['มี submit/m4/room2', g => g.fs.isDir(S + '/submit/m4/room2')]],
    hint1: ['mkdir', '-p'], solution: 'mkdir -p submit/m4/room2', cards: [],
    check: g => g.fs.isDir(S + '/submit/m4/room2'),
    outro: [['root', 'missing operand = ขาดของที่ต้องใส่ต่อท้าย บอกให้ครบว่าจะสร้างอะไร']],
  },
  {
    id: '4-5', phase: 4, needs: fs => fs.mkdirp(S + '/backup'), title: 'ก๊อปครึ่งๆ กลางๆ', place: 'ห้องแล็บ', cwd: S,
    intro: [['kru', 'สำรองไฟล์คะแนน scores.csv กับโฟลเดอร์ lab ไว้ใน backup ก่อนไวรัสแก้!']],
    mission: 'ก๊อป scores.csv และโฟลเดอร์ lab ไปไว้ใน backup',
    hint1: ['cp', '-r'], solution: 'cp scores.csv backup/  และ  cp -r lab backup/', cards: [],
    check: g => g.fs.isFile(S + '/backup/scores.csv') && g.fs.isFile(S + '/backup/lab/result1.txt') && g.fs.isFile(S + '/scores.csv') && g.fs.isFile(S + '/lab/result1.txt'),
    fail: g => (!g.fs.exists(S + '/scores.csv') || !g.fs.exists(S + '/lab')) && 'ของเดิมหายไปจากที่เดิม นั่นคือการย้าย (mv) แต่ภารกิจคือก๊อปสำรองไว้ (cp) กด "ย้อนเวลา"',
    steps: [['ก๊อป scores.csv ไปไว้ใน backup', g => g.fs.isFile(S + '/backup/scores.csv')], ['ก๊อปโฟลเดอร์ lab ไปไว้ใน backup', g => g.fs.isFile(S + '/backup/lab/result1.txt')]],
    outro: [['root', 'missing destination = ลืมบอกปลายทาง, -r not specified = ลืมบอกว่าเอาทั้งโฟลเดอร์ สองอันนี้เจอบ่อยสุดแล้ว']],
  },
  {
    id: '4-6', phase: 4, title: 'หลุมดำ', place: 'ห้องชมรม', cwd: S,
    intro: [['virus', 'เก็บ club เข้าไปไว้ใน club/old สิ เรียบร้อยดีออก 👾'], ['kru', 'ครูแค่อยากให้เก็บโฟลเดอร์ club เป็นชื่อ archive_club นะ']],
    mission: 'ย้ายโฟลเดอร์ club ไปเป็น archive_club',
    steps: [['มี archive_club แล้ว', g => g.fs.isDir(S + '/archive_club')], ['club เดิมไม่เหลือแล้ว', g => g.fs.isFile(S + '/archive_club/members.txt') && !g.fs.exists(S + '/club')]],
    hint1: ['mv'], solution: 'mv club archive_club', cards: [],
    check: g => g.fs.isFile(S + '/archive_club/members.txt') && !g.fs.exists(S + '/club'),
    nudge: g => g.fs.isDir(S + '/archive_club') && g.fs.exists(S + '/club') && 'archive_club มีแล้ว แต่ club ยังอยู่ ครูให้ย้าย ไม่ใช่ก๊อป',
    outro: [['root', 'ย้ายโฟลเดอร์เข้าไปในตัวเองไม่ได้ เหมือนพยายามใส่กล่องลงในตัวมันเอง']],
  },
  {
    id: '4-7', phase: 4, title: 'อ่านคู่มือเป็น', place: 'ห้องคอม', cwd: S,
    intro: [['root', 'พี่จะไม่บอกแล้ว ls มีตัวเลือกดูรายละเอียดไฟล์ (ขนาด เจ้าของ) ลองหาจากคู่มือ ls --help เอง']],
    mission: 'ใช้ ls แบบแสดงรายละเอียด (ขนาดไฟล์ เจ้าของ)',
    steps: [['ดูไฟล์แบบแสดงรายละเอียด', g => ranOk(g, 'ls', c => c.args.some(a => /^-[a-zA-Z]*l/.test(a)))]],
    hint1: ['ls --help', 'man ls'], solution: 'ls -l', cards: ['--help'],
    check: g => ranOk(g, 'ls', c => c.args.some(a => /^-[a-zA-Z]*l/.test(a))),
    outro: [['root', 'ติดตรงไหน --help ช่วยได้เสมอ คนเก่งไม่ได้จำทุกอย่าง แต่รู้ว่าต้องไปหาที่ไหน']],
  },
  {
    id: '4-8', phase: 4, boss: true, title: 'มินิบอส: ตู้เซฟข้อสอบ', place: 'ห้องธุรการ', cwd: S, password: 'pass123',
    arrive: fs => { fs.write(S + '/vault/x.trap', '💣'); fs.write(S + '/vault/drawer/y.trap', '💣'); },
    intro: [['root', 'ไวรัสวางกับดัก .trap ไว้ในตู้เซฟ vault อ่านข้อสอบให้ได้ ลบกับดักทุกอัน (ดูก่อนลบนะ) แล้วปิดเครื่อง รหัส pass123']],
    mission: 'อ่าน vault/exam.txt, ลบไฟล์ .trap ทั้งหมดใน vault (ของอื่นห้ามหาย) แล้วปิดเครื่อง',
    hint1: ['cat', 'sudo', 'find', 'rm -i', 'poweroff'], solution: 'sudo cat vault/exam.txt → find vault -name "*.trap" → rm -i vault/x.trap vault/drawer/y.trap → sudo poweroff', cards: [],
    check: g => sawOut(g, 'ข้อสอบกลางภาค') && !g.fs.exists(S + '/vault/x.trap') && !g.fs.exists(S + '/vault/drawer/y.trap') && g.fs.exists(S + '/vault/drawer/pens.txt') && g.fs.exists(S + '/vault/exam.txt') && g.sh.flags.poweroff,
    steps: [
      ['อ่าน vault/exam.txt', g => sawOut(g, 'ข้อสอบกลางภาค')],
      [g => `ลบไฟล์ .trap ทั้งหมด (${[S + '/vault/x.trap', S + '/vault/drawer/y.trap'].filter(p => !g.fs.exists(p)).length}/2)`,
        g => !g.fs.exists(S + '/vault/x.trap') && !g.fs.exists(S + '/vault/drawer/y.trap')],
      ['ปิดเครื่อง', g => g.sh.flags.poweroff],
    ],
    fail: g => (!g.fs.exists(S + '/vault/exam.txt') || !g.fs.exists(S + '/vault/drawer/pens.txt')) && 'ลบของสำคัญไปด้วย! กด "ย้อนเวลา"',
    outro: [['root', 'ผ่านเฟส 4! ตอนนี้น้องอ่าน error เองได้แล้ว ต่อไปพี่จะสอนต่อคำสั่งหลายตัวเข้าด้วยกัน']],
  },

  // ================= BRIDGE =================
  {
    id: 'B1', phase: 'B', title: 'นับหัวไวรัส', place: 'ห้องใต้ดิน: โรงงานท่อ', cwd: S + '/.virus_nest',
    arrive: fs => nest(fs),
    intro: [
      ['root', 'รังไวรัสมีไฟล์เยอะจนนับไม่ไหว ls ออกมาเต็มจอเลย'],
      ['root', 'เราจะต่อ "ท่อ" | (Shift + \\) ให้ผลของ ls ไหลไปเข้าเครื่องนับ wc -l (นับบรรทัด)'],
    ],
    mission: 'นับว่าในรังมีไฟล์ทั้งหมดกี่ไฟล์ โดยต่อท่อ ls เข้า wc -l',
    steps: [['ดูไฟล์ในรัง', g => ranOk(g, 'ls')], ['ต่อท่อ ls เข้า wc -l ให้ได้ตัวเลข', g => g.hist.some(r => r.stdout.trim() === '137')]],
    hint1: ['|', 'wc -l'], solution: 'ls | wc -l', cards: ['|', 'wc -l'],
    check: g => lastOut(g) === '137',
    outro: [['root', '137 ตัว! ท่อ | คือเอาผลของคำสั่งซ้ายไปเป็นของกินของคำสั่งขวา']],
  },
  {
    id: 'B2', phase: 'B', needs: fs => { if (!fs.exists(S + '/.virus_nest/mua_001.bin')) nest(fs); }, title: 'กรองเอาแต่ตัวร้าย', place: 'โรงงานท่อ', cwd: S + '/.virus_nest',
    intro: [['root', 'ในรังมีไฟล์ log ปนอยู่ด้วย เราอยากรู้เฉพาะตัวที่ชื่อมี mua ใช้ grep กรองก่อน แล้วค่อยนับ']],
    mission: 'นับเฉพาะไฟล์ที่ชื่อมีคำว่า mua (ต่อท่อ 2 ต่อ)',
    steps: [['กรองเฉพาะชื่อที่มี mua ด้วย grep', g => ranOk(g, 'grep')], ['ต่อท่ออีกต่อไปนับให้ได้ตัวเลข', g => g.hist.some(r => r.stdout.trim() === '89' && r.line.includes('|'))]],
    hint1: ['grep', '|', 'wc -l'], solution: 'ls | grep mua | wc -l', cards: ['grep'],
    check: g => lastOut(g) === '89' && g.res.line.includes('|'),
    outro: [['root', 'ต่อท่อกี่ต่อก็ได้ ข้อมูลไหลจากซ้ายไปขวาเหมือนสายพาน']],
  },
  {
    id: 'B3', phase: 'B', title: 'ปิดเสียงบ่น', place: 'ทั้งเครื่อง', cwd: HOME,
    arrive: fs => fs.tree('/var/backups', { '.old/': { 'flag.txt': 'FLAG{2>/dev/null_คือหลุมดำ}' } }),
    intro: [['root', 'ไวรัสซ่อน flag.txt ไว้ที่ไหนสักแห่งในเครื่อง ลองค้นทั้งเครื่องตั้งแต่ / ดูเลย']],
    mission: 'หา flag.txt ทั้งเครื่อง โดยให้จอสะอาด ไม่มีคำบ่น Permission denied',
    hint1: ['find /', '2>/dev/null'], solution: 'find / -name flag.txt 2>/dev/null', cards: ['2>/dev/null'],
    check: g => cleanFlag(g.res),
    steps: [
      ['ค้นหา flag.txt ทั้งเครื่อง (เริ่มที่ /)', g => g.hist.some(onlyFlag)],
      ['ค้นอีกรอบให้จอสะอาด ไม่มีคำบ่นเลย', g => g.hist.some(cleanFlag)],
    ],
    // Searching from / always "fails" (exit 1) because of Permission denied, so these hints run on errors.
    errNudge: g => {
      const r = g.res;
      if (/Permission denied/.test(r.stderr) && onlyFlag(r))
        return 'เจอแล้ว! แต่จอเต็มไปด้วย Permission denied ข้อความบ่นพวกนี้ไหลออกทางช่องที่ 2 (stderr) คนละช่องกับผลลัพธ์ ต่อท้ายคำสั่งเดิมด้วย 2>/dev/null เพื่อเทคำบ่นลงหลุมดำ';
      if (/Permission denied/.test(r.stderr))
        return 'ค้นจาก / ถูกแล้ว แต่ยังไม่ได้บอกชื่อไฟล์ ใส่ -name flag.txt ด้วย';
      if (r.cmds.some(c => c.name === 'find') && /No such file or directory/.test(r.stderr))
        return 'find ต้องบอกที่เริ่มค้นก่อน แล้วค่อยบอกชื่อ: find <เริ่มจากไหน> -name <ชื่อไฟล์>  ภารกิจนี้ให้ค้นทั้งเครื่อง = เริ่มที่ /';
    },
    outro: [['root', '2> = ช่องข้อความบ่น (stderr) /dev/null = หลุมดำ ทิ้งลงไปแล้วหายเลย เหลือแต่ผลที่อยากได้']],
  },
  {
    id: 'B4', phase: 'B', title: 'เก็บใส่ถัง', place: 'เครื่องครูสมใจ', cwd: HOME,
    intro: [['kru', 'ครูอยากได้ "รายชื่อไฟล์ใหญ่เกิน 50MB ใน Downloads" เป็นไฟล์ชื่อ big_list.txt ไว้เปิดดูทีหลัง'], ['root', 'ใช้ > เทผลลงไฟล์แทนที่จะขึ้นจอ']],
    mission: 'เก็บรายชื่อไฟล์ใน ~/Downloads ที่ใหญ่เกิน 50MB ลงไฟล์ big_list.txt',
    hint1: ['find', '-size', '>'], solution: 'find ~/Downloads -type f -size +50M > big_list.txt', cards: ['>'],
    check: g => bigOnly(g.fs.read(HOME + '/big_list.txt')),
    steps: [
      ['กรองให้เหลือเฉพาะไฟล์ที่ใหญ่เกิน 50MB', g => g.hist.some(r => bigOnly(r.stdout)) || bigOnly(g.fs.read(HOME + '/big_list.txt'))],
      ['เทผลลงไฟล์ big_list.txt ด้วย >', g => bigOnly(g.fs.read(HOME + '/big_list.txt'))],
    ],
    nudge: g => {
      const t = g.fs.read(HOME + '/big_list.txt');
      if (bigOnly(g.res.stdout)) return 'รายชื่อบนจอถูกแล้ว! แต่มันไหลขึ้นจอ ไม่ได้ลงไฟล์ เติม > ~/big_list.txt ต่อท้ายคำสั่งเดิม';
      if (t != null && SMALL.some(f => t.includes(f)))
        return 'big_list.txt มีแล้ว แต่ข้างในมีไฟล์เล็ก (song.mp3, homework.pdf) ปนมาด้วย เพราะ ls เอาทุกไฟล์ ต้องใช้คำสั่งที่กรองขนาดได้ (แบบด่าน 3-6) แล้วค่อยเทผลลงไฟล์ด้วย > (เขียนทับของเดิมได้เลย)';
      if (t != null && !bigOnly(t)) return 'big_list.txt มีแล้ว แต่รายชื่อข้างในยังไม่ครบ ลอง cat big_list.txt ดู';
      if (t == null && SMALL.some(f => g.res.stdout.includes(f))) return 'ls โชว์ทุกไฟล์ ทั้งเล็กทั้งใหญ่ ครูอยากได้เฉพาะไฟล์ที่ใหญ่เกิน 50MB ต้องกรองก่อน';
    },
    outro: [['root', 'สังเกตว่าไม่มีอะไรขึ้นจอ เพราะไหลลงไฟล์หมด ระวัง: > เขียนทับของเดิม >> ต่อท้าย']],
  },
  {
    id: 'B5', phase: 'B', title: 'สายพานสั่งงาน', place: 'เครื่องครูสมใจ', cwd: HOME,
    intro: [['kru', 'ครูเช็กรายชื่อใน big_list.txt แล้ว ลบได้ทั้งหมดเลย'], ['root', 'xargs = สายพาน เอาทุกคำที่ไหลมาในท่อไปต่อท้ายคำสั่ง ดูรายการก่อนนะ แล้วค่อยส่งเข้า xargs rm']],
    mission: 'ลบทุกไฟล์ที่อยู่ในรายชื่อ big_list.txt โดยใช้ xargs',
    steps: [['ส่งรายชื่อเข้า xargs rm', g => !g.fs.exists(HOME + '/Downloads/ubuntu.iso') && g.hist.some(r => r.line.includes('xargs'))], ['song.mp3 ยังอยู่', g => !g.fs.exists(HOME + '/Downloads/ubuntu.iso') && g.fs.exists(HOME + '/Downloads/song.mp3')]],
    hint1: ['cat', '|', 'xargs rm'], solution: 'cat big_list.txt | xargs rm', cards: ['xargs'],
    check: g => !g.fs.exists(HOME + '/Downloads/ubuntu.iso') && !g.fs.exists(HOME + '/Downloads/movie_night.mp4') && !g.fs.exists(HOME + '/Downloads/old_backup.zip') && g.fs.exists(HOME + '/Downloads/song.mp3') && g.hist.some(r => r.line.includes('xargs')),
    fail: g => (!g.fs.exists(HOME + '/Downloads/song.mp3') || !g.fs.exists(HOME + '/Downloads/homework.pdf')) && 'ไฟล์ที่ไม่อยู่ในรายการหายไปด้วย! กด "ย้อนเวลา"',
    outro: [['root', 'ถ้า xargs จบด้วย [123] แปลว่ามีคำสั่งที่มันสั่งไปพังอย่างน้อยหนึ่งตัว และระวังชื่อไฟล์มีช่องว่าง xargs จะหั่นเป็นสองชื่อ'], ['root', 'จบด่านสะพานแล้ว! เครื่องมือครบแล้ว ได้เวลาไปพาน้องล่ามกลับมา']],
  },

  // ================= RESCUE: get น้องล่าม out of the virus's quarantine =================
  {
    id: 'R1', phase: 'R', title: 'ตามหาน้องล่าม', place: 'เซิร์ฟเวอร์ป้าเซิร์ฟ', cwd: HOME,
    arrive: fs => quarantine(fs),   // the virus drags the sleeping น้องล่าม off to /quarantine
    intro: [['root', 'ไวรัสลากน้องล่ามที่หลับอยู่ไปขังไว้ที่ไหนสักแห่งในเครื่อง โฟลเดอร์ของน้องชื่อขึ้นต้นด้วย nong'], ['virus', 'หาให้เจอสิ ข้าซ่อนไว้ในที่ที่มนุษย์ไม่กล้าเข้า 👾']],
    mission: 'หาว่าโฟลเดอร์ของน้องล่าม (ชื่อขึ้นต้นด้วย nong) ถูกขังอยู่ที่ไหนในเครื่อง',
    steps: [['ค้นทั้งเครื่อง หาชื่อที่ขึ้นต้นด้วย nong', g => sawOut(g, '/quarantine/nong_lam')]],
    hint1: ['find /', '-name "nong*"', '2>/dev/null'], solution: 'find / -name "nong*" 2>/dev/null', cards: ['find -name "x*"'],
    check: g => sawOut(g, '/quarantine/nong_lam'),
    errNudge: g => /Permission denied/.test(g.res.stderr) && !g.res.stdout.includes('nong') && 'ค้นทั้งเครื่องถูกแล้ว แต่ต้องบอกชื่อด้วย -name และถ้ารู้แค่ต้นชื่อ ใช้ "nong*" (ดอกจัน = อะไรก็ได้ต่อจากนี้)',
    outro: [['root', 'เจอแล้ว! /quarantine ห้องกักกันของไวรัส'], ['virus', 'เจอก็ไม่ได้แปลว่าจะเข้าได้นะ 👾']],
  },
  {
    id: 'R2', phase: 'R', title: 'กับดักหน้าห้องขัง', place: '/quarantine', cwd: HOME,
    intro: [['root', 'หน้าห้องขังมีกับดัก .mua วางเต็มไปหมด ลบให้หมดก่อน แต่ห้ามแตะโฟลเดอร์น้องล่ามเด็ดขาด'], ['root', 'ห้องนี้เป็นของ root และดูก่อนลบทุกครั้งนะ']],
    mission: 'ลบไฟล์ .mua ทั้งหมดใน /quarantine โดยที่ nong_lam ต้องอยู่ครบ',
    steps: [
      ['ดูรายชื่อกับดักก่อนลบ', g => sawOut(g, 'trap_01.mua'), { optional: true }],
      [g => `ลบกับดัก .mua ทั้งหมด (${TRAPS.filter(p => !g.fs.exists(p)).length}/${TRAPS.length})`, g => TRAPS.every(p => !g.fs.exists(p))],
      ['น้องล่ามยังอยู่ครบ', g => TRAPS.every(p => !g.fs.exists(p)) && lamIntact(g.fs, '/quarantine/nong_lam')],
    ],
    hint1: ['find', '-name "*.mua"', '-print', '-delete', 'sudo'], solution: 'sudo find /quarantine -name "*.mua" -print → sudo find /quarantine -name "*.mua" -delete', cards: ['find -delete'],
    check: g => TRAPS.every(p => !g.fs.exists(p)) && lamIntact(g.fs, '/quarantine/nong_lam'),
    fail: g => !lamIntact(g.fs, '/quarantine/nong_lam') && 'ไฟล์ของน้องล่ามหายไปด้วย! กด "ย้อนเวลา"',
    errNudge: g => /Permission denied/.test(g.res.stderr) && g.res.cmds.some(c => ['rm', 'find'].includes(c.name) && !c.sudo) && 'ห้องขังเป็นของ root ลบของในนั้นต้องขอสิทธิ์แอดมินก่อน',
    outro: [['root', 'กับดักหมดแล้ว ทางสะดวก']],
  },
  {
    id: 'R3', phase: 'R', title: 'พาน้องออกมา', place: '/quarantine', cwd: HOME,
    intro: [['root', 'ย้ายโฟลเดอร์น้องล่ามออกมาไว้ที่บ้านเรา (~) ห้องขังเป็นของ root ต้องใช้สิทธิ์แอดมิน']],
    mission: 'ย้าย /quarantine/nong_lam มาไว้ในบ้านของเรา (~)',
    steps: [
      ['พาน้องล่ามออกจากห้องขัง', g => !g.fs.exists('/quarantine/nong_lam')],
      ['น้องล่ามมาอยู่ที่ ~/nong_lam ครบทุกไฟล์', g => lamIntact(g.fs, HOME + '/nong_lam')],
    ],
    hint1: ['mv', 'sudo', '~'], solution: 'sudo mv /quarantine/nong_lam ~/', cards: ['sudo mv'],
    check: g => !g.fs.exists('/quarantine/nong_lam') && lamIntact(g.fs, HOME + '/nong_lam'),
    fail: g => !g.fs.exists('/quarantine/nong_lam') && !g.fs.exists(HOME + '/nong_lam') && 'น้องล่ามหายไปไหนแล้ว? ดูว่าย้ายไปผิดที่หรือเปล่า (ls) หรือกด "ย้อนเวลา"',
    nudge: g => g.fs.exists('/quarantine/nong_lam') && g.fs.isDir(HOME + '/nong_lam') && 'ก๊อปออกมาแล้ว แต่ตัวจริงยังติดอยู่ในห้องขัง ภารกิจนี้ต้อง "ย้าย"',
    errNudge: g => /Permission denied/.test(g.res.stderr) && g.res.cmds.some(c => c.name === 'mv' && !c.sudo) && 'ห้องขังเป็นของ root ย้ายของออกต้องขอสิทธิ์แอดมินก่อน',
    outro: [['root', 'น้องออกมาแล้ว!']],
  },
  {
    id: 'R4', phase: 'R', title: 'ปลุกน้องล่าม', place: 'บ้านของเรา', cwd: HOME,
    get programs() { return WAKE; },   // getter: WAKE is defined further down
    intro: [['root', 'ในโฟลเดอร์น้องมีสคริปต์ปลุก wake.sh อยู่ เข้าไปแล้วสั่งรันมันเลย'], ['root', 'ไฟล์ที่รันได้จะเป็นสีเขียวตอน ls']],
    mission: 'เข้าไปในโฟลเดอร์ nong_lam แล้วรันสคริปต์ wake.sh เพื่อปลุกน้องล่าม',
    steps: [
      ['เข้าไปในโฟลเดอร์ nong_lam', g => g.sh.cwd === HOME + '/nong_lam' || !!g.sh.flags.wakeTried],
      ['รัน wake.sh', g => !!g.sh.flags.wakeTried],
    ],
    hint1: ['cd', './'], solution: 'cd nong_lam → ./wake.sh', cards: ['./'],
    check: g => !!g.sh.flags.wakeTried,
    errNudge: g => /wake(\.sh)?: command not found/.test(g.res.stderr) && 'ไฟล์ในโฟลเดอร์ที่เราอยู่ต้องรันด้วย ./ ข้างหน้า เช่น ./wake.sh (เครื่องหาคำสั่งแค่ในที่เก็บโปรแกรม ไม่หาในโฟลเดอร์ที่เราอยู่)',
    cutsceneAfter: ['nowake', 'timeskip'],   // she doesn't wake, then three months with ครูสมใจ
    outro: [],
  },

  // ================= LAST ACT: three months later, wake น้องล่าม =================
  {
    id: 'LAST', phase: 5, boss: true, title: 'บทสุดท้าย: ปลุกน้องล่าม', place: 'บ้านของเรา', cwd: HOME,
    arrive: fs => afterThreeMonths(fs),
    get programs() { return WAKE; },   // getter: WAKE is defined further down
    intro: [
      ['root', 'พี่หาเจอแล้ว สมองของน้อง (~/nong_lam/brain) มีไฟล์ .block ของไวรัสอุดอยู่'],
      ['root', 'ลบ .block ให้หมด แต่ความทรงจำของน้อง (.dat) ห้ามหายแม้แต่ไฟล์เดียว ดูก่อนลบนะ แล้วค่อยรัน wake.sh อีกรอบ'],
      ['root', 'ในสมองน้องมีไฟล์ความทรงจำด้วยนะ ลอง cat อ่านดูสิ น้องจำเธอได้ทุกอย่าง'],
      ['kru', 'ขอบใจที่ช่วยงานครูมาตลอดนะ ตาน้องล่ามแล้ว'],   // wording that already has a voice file
    ],
    mission: 'ลบไฟล์ .block ทั้งหมดใน ~/nong_lam/brain (ความทรงจำ .dat ต้องอยู่ครบ) แล้วรัน wake.sh อีกครั้ง',
    steps: [
      ['ดูไฟล์ในสมองน้องก่อนลบ', g => sawOut(g, 'jam_01.block'), { optional: true }],
      [g => `ลบไฟล์ .block ทั้งหมด (${BLOCKS.filter(p => !g.fs.exists(p)).length}/${BLOCKS.length})`, g => BLOCKS.every(p => !g.fs.exists(p))],
      ['ความทรงจำ .dat อยู่ครบ', g => BLOCKS.every(p => !g.fs.exists(p)) && MEMORIES.every(p => g.fs.exists(p))],
      ['รัน wake.sh อีกครั้ง', g => !!g.sh.flags.woke],
    ],
    hint1: ['find', '-name "*.block"', '-print', '-delete', 'sudo', './wake.sh'],
    solution: 'sudo find ~/nong_lam/brain -name "*.block" -print → sudo find ~/nong_lam/brain -name "*.block" -delete → cd ~/nong_lam → ./wake.sh', cards: [],
    check: g => !!g.sh.flags.woke && MEMORIES.every(p => g.fs.exists(p)),
    fail: g => !MEMORIES.every(p => g.fs.exists(p)) && 'ความทรงจำของน้องล่ามหายไปด้วย! (ระวัง *block* จะโดน favorite_block_game.dat ด้วย) กด "ย้อนเวลา"',
    errNudge: g => /Permission denied/.test(g.res.stderr) && g.res.cmds.some(c => ['rm', 'find'].includes(c.name) && !c.sudo) && 'โฟลเดอร์ของน้องยังเป็นของ root (ย้ายมาด้วย sudo) ลบต้องขอสิทธิ์แอดมิน',
    cutsceneAfter: 'ending', lamWakes: true,
    outro: [],
  },
];

// =====================================================================================================
// The machine. Everything a level needs is here from the start, like a real computer, except what the story adds
// later through arrive(): the virus's files, the quarantine, and three months of work for ครูสมใจ.
// =====================================================================================================
const SYSLOG = '06:58 INFO boot ok\n06:59 INFO network up (router.cfg loaded)\n07:00 INFO backup job finished';

export function initialWorld(fs) {
  fs.tree(S, {
    'homework.txt': 'การบ้านคณิต ม.4/2: แบบฝึกหัดข้อ 1-20 ส่งวันศุกร์',
    'class_photo.jpg': { content: '\xff\xd8\xff\xe0 JFIF รูปรุ่น ม.4/2', size: 2_400_000 },
    'virus.exe': '👾 ฮ่าๆๆ ข้าคือไวรัสมั่วซั่ว!',   // arrived the night before the game starts
    'report.txt': 'รายงานชมรมหุ่นยนต์ ภาคเรียนที่ 1\nทำแขนกลหยิบลูกบอลได้ 7 จาก 10 ครั้ง',
    'science_report.txt': 'รายงานวิทยาศาสตร์ ม.4/2: การทดลองน้ำตาลกับยีสต์',
    'scores.csv': 'id,score\n1,18\n2,20\n3,15',
    'photos/': { 'trip_kanchanaburi.jpg': { content: 'jpg', size: 1_800_000 } },
    'teachers_room/': {
      'letter.txt': 'ถึงนักเรียนที่มาเช้าที่สุด\nครูทำไฟล์เกรดหาย ช่วยด้วย!\nไวรัสมันซ่อนไว้ที่ไหนสักแห่งในเครื่อง\n— ครูสมใจ',
      'exam.txt': { content: EXAM, priv: true },
      'my notes.txt': 'โน้ตครูสมใจ: พรุ่งนี้สอบ 9 โมง ห้อง 402',
    },
    'old/': {
      '2568/': { 'term2/': { 'attendance.txt': 'รายชื่อเข้าเรียน ม.4/2 เทอม 2/2568' } },
      '2569/': { 'term1/': { 'grades.txt': 'เกรดวิทยาการคำนวณ ม.4/2\nเลขที่ 1  A\nเลขที่ 2  B+' } },
    },
    'library/': { 'books.txt': 'รายชื่อหนังสือ: Linux เบื้องต้น, คู่มือไพทอน, นิยายวิทยาศาสตร์', 'shelf_a/': { 'novel.txt': 'นิยาย: ล่ามในเครื่อง' } },
    'lab/': {
      'notes/': { 'day1.txt': 'บันทึกวันที่ 1: ผลการทดลองถูกไวรัสแก้เป็น 999 ทุกช่อง!' },
      'beaker.txt': 'บีกเกอร์ 20 ใบ', 'result1.txt': 'ผลทดลอง 1: น้ำตาล 10 กรัม ฟองขึ้น 3 ซม.',
    },
    'club/': { 'members.txt': 'สมาชิกชมรมหุ่นยนต์ 12 คน', 'plan.txt': 'แผนงาน: แข่งหุ่นยนต์เดือนหน้า', 'robots/': { 'arm.txt': 'แขนกล v2' }, 'old/': {} },
    'gym/': { 'locker_01/': { 'shoes.txt': 'รองเท้าวิ่ง' }, 'locker_12/': {}, 'balls/': {} },
    'stage/': { 'props.txt': 'อุปกรณ์ละคร', 'costumes/': { 'hats/': { 'red/': { 'hat.txt': 'หมวกแดง' } } } },
    'storage/': {
      'yearbook_video.mp4': { content: 'วิดีโอรุ่น ม.6 ปี 2569', size: 314_572_800 },
      'poster.png': { content: 'png', size: 3_145_728 },
      'notes.txt': 'รายการของในห้องเก็บของ',
    },
    'server_room/': { '__ro': true, 'system.log': SYSLOG, 'router.cfg': 'config: school-router' },
    'exam_room2/': { 'seats.txt': 'ผังที่นั่งสอบ ห้อง 402' },
    'vault/': {
      'exam.txt': { content: EXAM, priv: true }, 'answer_key.txt': { content: 'เฉลย: ข้อ 1 (ก)', priv: true },
      'drawer/': { 'pens.txt': 'ปากกาแดง 3 ด้าม' },
    },
    'projects/': {}, 'submit/': {},
  });
  fs.tree(HOME + '/Downloads', {
    'movie_night.mp4': { content: 'mp4', size: 943_718_400 },
    'ubuntu.iso': { content: 'iso', size: 6_227_702_784 },
    'old_backup.zip': { content: 'zip', size: 125_829_120 },
    'song.mp3': { content: 'mp3', size: 5_242_880 },
    'homework.pdf': { content: 'pdf', size: 2_097_152 },
  });
  lamHome(fs);
  markKeep(fs);
}

// Work files ครูสมใจ cares about: if one is deleted (not moved) she restores it and tells the player off.
const KEEP = [
  'homework.txt', 'class_photo.jpg', 'report.txt', 'science_report.txt', 'scores.csv', 'photos/trip_kanchanaburi.jpg',
  'teachers_room/letter.txt', 'teachers_room/exam.txt', 'teachers_room/my notes.txt',
  'old/2568/term2/attendance.txt', 'old/2569/term1/grades.txt', 'library/books.txt', 'library/shelf_a/novel.txt',
  'lab/notes/day1.txt', 'lab/beaker.txt', 'lab/result1.txt', 'club/members.txt', 'club/plan.txt', 'club/robots/arm.txt',
  'gym/locker_01/shoes.txt', 'storage/yearbook_video.mp4', 'storage/poster.png', 'storage/notes.txt',
  'server_room/router.cfg', 'exam_room2/seats.txt', 'vault/exam.txt', 'vault/answer_key.txt', 'vault/drawer/pens.txt',
].map(p => S + '/' + p).concat(['song.mp3', 'homework.pdf'].map(p => HOME + '/Downloads/' + p));
function markKeep(fs, paths = KEEP) {
  for (const p of paths) { const n = fs.get(p); if (n && n.t === 'f') n.keep = p; }
}

// Move a node the way the virus would (keeps its identity, so a "work file" stays one after a rename).
function rename(fs, from, to) {
  const n = fs.get(from);
  if (!n) return;
  fs.remove(from);
  fs.mkdirp(to.slice(0, to.lastIndexOf('/'))).kids[to.slice(to.lastIndexOf('/') + 1)] = n;
}

function nest(fs) {
  const spec = {};
  for (let i = 1; i <= 89; i++) spec[`mua_${String(i).padStart(3, '0')}.bin`] = '👾';
  for (let i = 1; i <= 48; i++) spec[`log_${String(i).padStart(3, '0')}.tmp`] = 'log';
  fs.tree(S + '/.virus_nest', spec);
}

// ---- rescue arc: /quarantine is root's (readable, only sudo can change it) ----
const Q = '/quarantine', LAM = 'nong_lam';
const TRAPS = [1, 2, 3, 4, 5].map(i => `${Q}/trap_0${i}.mua`).concat(`${Q}/gate/trap_06.mua`);
const brain = base => base + '/brain';
// น้องล่าม's memories, written from what this player actually typed (journal.js) when the virus locks her away.
const THAI = /[฀-๿]/;
function thought(e) {
  if (/poweroff/.test(e.ran || '')) return 'ปิดเครื่อง... ง่วงจัง';
  if (e.code && e.code !== 0) return 'พิมพ์ผิดนิดหน่อย ไม่เป็นไร เดี๋ยวเธอก็แก้ได้ เราเชื่อเธอ';
  if (/^sudo /.test(e.ran || '')) return 'ใช้สิทธิ์แอดมินเป็นแล้ว ระวังด้วยนะ พลังมากต้องรับผิดชอบมาก';
  if (THAI.test(e.said)) return 'ยังพิมพ์ไทยอยู่เลย น่ารักดี เราแปลให้เอง';
  return 'พิมพ์คำสั่งจริงเองได้แล้ว! ภูมิใจจัง';
}
function memories(all = false) {
  const j = journal();
  const first = j[0];
  const thai = [...new Map(j.filter(e => THAI.test(e.said) && e.ran && e.ran !== e.said).map(e => [e.said, e])).values()].slice(0, 8);
  const typed = j.length, oops = j.filter(e => e.code && e.code !== 0).length;
  const night = j.filter(e => e.lv === '3-8').slice(-8);
  const m = {
    'memory_first_day.dat': first
      ? `บันทึกความทรงจำ #1 — วันแรก\nเช้านั้นเครื่องเงียบมาก แล้วจู่ๆ ก็มีคนพิมพ์มาหาเรา เป็นคนแรกเลย!\nเธอพิมพ์ว่า: "${first.said}"\n` +
        (first.ran && first.ran !== first.said ? `เราแปลให้เป็น: ${first.ran}\n` : '') +
        'ในใจเราคิดว่า: ตื่นเต้นมาก มีคนคุยด้วยแล้ว เราจะช่วยคนนี้ให้เต็มที่เลย'
      : 'บันทึกความทรงจำ #1 — วันแรก\nเช้านั้นมีคนเปิด terminal มาทักเราเป็นคนแรก\nในใจเราคิดว่า: ตื่นเต้นมาก มีคนคุยด้วยแล้ว',
    'memory_thai_words.dat': 'คำที่เธอพิมพ์มา แล้วเราแปลให้\n' +
      (thai.length ? thai.map(e => `"${e.said}" = ${e.ran}`).join('\n') : '"ดูไฟล์" = ls\n"เข้าไป" = cd\n"ปิดคอมดิ" = sudo poweroff') +
      '\nในใจเราคิดว่า: ภาษาไทยมั่วๆ ของเธอ เราจำได้ทุกคำเลยนะ',
    'memory_friends.dat': 'เพื่อนของเรา\nครูสมใจ: ใจดี แต่ชอบลืมว่าไฟล์เกรดอยู่ไหน\nพี่รูท: พูดน้อย แต่มาช่วยทุกครั้ง\nลุงเอก: ชอบบอกคำใบ้\n' +
      `เธอ: คนที่เปิด terminal มาสู้ไปด้วยกัน พิมพ์คำสั่งไปแล้ว ${typed} ครั้ง พิมพ์ผิด ${oops} ครั้ง แต่ไม่เคยยอมแพ้`,
    'favorite_block_game.dat': 'เกมที่ชอบที่สุด: เกมต่อบล็อก\nตอนบล็อกตกลงล็อกพอดี มันรู้สึกเหมือนพิมพ์คำสั่งถูกเป๊ะทั้งบรรทัด',
    'last_log.dat': 'บันทึกระบบ — คืนที่ไวรัสบุกห้องเซิร์ฟเวอร์ (ด่าน 3-8)\n' +
      (night.length
        ? night.map(e => `เธอพิมพ์: ${e.said}${e.ran && e.ran !== e.said ? `  (แปลเป็น ${e.ran})` : ''}  ${e.code ? '✗' : '✓'}\n  เราคิด: ${thought(e)}`).join('\n')
        : 'เธอพาเราเข้าห้องเซิร์ฟเวอร์ อ่าน log ลบไวรัส แล้วปิดเครื่อง') +
      '\n[!] ไวรัสกัดโมดูลล่าม — ล่ามกำลังหลับ\nความคิดสุดท้ายก่อนหลับ: ไม่ต้องห่วงนะ เธอเก่งพอจะสู้ต่อคนเดียวแล้ว ฝากสมุดไว้ด้วย แล้วมาปลุกเรานะ',
  };
  if (all) return m;
  // Before the rescue arc only what has really happened is in her brain: memories grow as the player plays.
  if (!first) delete m['memory_first_day.dat'];
  if (!thai.length) delete m['memory_thai_words.dat'];
  if (!night.length) delete m['last_log.dat'];
  if (!typed) m['memory_friends.dat'] = 'เพื่อนของเรา\nครูสมใจ: ใจดี แต่ชอบลืมว่าไฟล์เกรดอยู่ไหน\nพี่รูท: พูดน้อย แต่มาช่วยทุกครั้ง\nลุงเอก: ชอบบอกคำใบ้\n(ยังไม่มีใครเปิด terminal มาคุยกับเราเลย รออยู่นะ)';
  return m;
}
const MEMORY_NAMES = ['memory_first_day.dat', 'memory_thai_words.dat', 'memory_friends.dat', 'favorite_block_game.dat', 'last_log.dat'];

const BLOCK_NAMES = [1, 2, 3, 4, 5].map(i => `jam_0${i}.block`);
const MEMORIES = MEMORY_NAMES.map(n => `${HOME}/${LAM}/brain/${n}`);
const BLOCKS = BLOCK_NAMES.map(n => `${HOME}/${LAM}/brain/${n}`);
const lamIntact = (fs, base) => fs.isFile(base + '/wake.sh') && MEMORY_NAMES.every(n => fs.isFile(brain(base) + '/' + n));

// ---- น้องล่าม lives on this machine from the very first level: /opt/nong_lam (root's, readable, not writable).
// Her brain/ grows from what this player really types (journal.js), the virus's bites go into damage.log, and at R1
// the virus MOVES this same folder into /quarantine and jams her brain with .block files.
const LAM_HOME = '/opt/' + LAM;
const LAM_PLACES = [LAM_HOME, `${Q}/${LAM}`, `${HOME}/${LAM}`];
const lamBase = fs => LAM_PLACES.find(p => fs.isDir(p)) || null;
// Her own files carry node.lamPart (it moves and copies with the node), so the game can tell a deleted brain from a
// moved one. Deleting one for real (fs.root.lamGone) is final: she is never rebuilt on that machine.
const tag = (fs, path, part) => { const n = fs.get(path); if (n && n.t === 'f') n.lamPart = part; };
export function lamParts(fs) {
  const found = new Set();
  const walk = node => { for (const n of Object.values(node.kids)) { if (n.t === 'd') walk(n); else if (n.lamPart) found.add(n.lamPart); } };
  walk(fs.root);
  return found;
}
export function markLamGone(fs) { fs.root.lamGone = true; }
// Tag her files wherever she is (machines saved before tagging existed, or a ย้อนเวลา snapshot from then).
export function tagLam(fs) {
  const base = lamBase(fs);
  if (!base) return;
  tag(fs, base + '/wake.sh', 'wake.sh');
  const b = fs.get(brain(base));
  if (b && b.t === 'd') for (const n of Object.keys(b.kids)) if (n.endsWith('.dat')) tag(fs, brain(base) + '/' + n, n);
}
function lamHome(fs) {
  fs.tree('/opt', { '__ro': true, [LAM + '/']: {
    '__ro': true,
    'wake.sh': { content: '#!/bin/bash\n# ปลุกน้องล่าม\ncheck brain/\nload language\nwake up', ro: true, x: true, prog: 'wake' },
    'brain/': { '__ro': true, 'damage.log': { content: 'บันทึกความเสียหายของน้องล่าม\n(ยังไม่มี สุขภาพดี 100%)', ro: true } },
  } });
  tag(fs, LAM_HOME + '/wake.sh', 'wake.sh');
}
// Write the memories that exist by now into her brain, wherever she is. world.js calls it at every level start.
export function syncBrain(fs, lv) {
  if (fs.root.lamGone) return;
  const all = LEVELS.indexOf(lv) >= LEVELS.findIndex(l => l.id === 'R1');
  if (!lamBase(fs) && !all) lamHome(fs);   // a machine saved before she lived in /opt
  const base = lamBase(fs);
  if (!base) return;
  for (const [n, text] of Object.entries(memories(all))) { fs.write(brain(base) + '/' + n, text, { ro: true }); tag(fs, brain(base) + '/' + n, n); }
  tag(fs, base + '/wake.sh', 'wake.sh');
}
// The virus's attacks, as น้องล่าม's own damage report.
function bite(fs, line) {
  const base = lamBase(fs);
  if (!base) return;
  const f = fs.get(brain(base) + '/damage.log');
  const old = f && f.t === 'f' ? f.content.replace(/\n\(ยังไม่มี สุขภาพดี 100%\)\n?$/, '\n') : 'บันทึกความเสียหายของน้องล่าม\n';
  if (old.includes(line)) return;
  fs.write(brain(base) + '/damage.log', old.replace(/\n*$/, '\n') + line, { ro: true });
}

function quarantine(fs) {
  if (fs.root.lamGone) return;   // deleted for good: nobody to lock away (the game ends before the rescue arc)
  if (!lamBase(fs)) lamHome(fs);   // someone removed her with sudo before the rescue arc: she is put back to be taken
  const q = { '__ro': true, 'README.txt': { content: 'ห้องกักกัน — ไวรัสมั่วซั่ว', ro: true }, 'gate/': { '__ro': true } };
  for (const p of TRAPS) {
    const rel = p.slice(Q.length + 1);
    if (rel.startsWith('gate/')) q['gate/'][rel.slice(5)] = { content: '💣', ro: true };
    else q[rel] = { content: '💣', ro: true };
  }
  fs.tree(Q, q);
  const from = lamBase(fs);
  if (from !== `${Q}/${LAM}`) rename(fs, from, `${Q}/${LAM}`);   // the same folder the player could see in /opt
  const base = `${Q}/${LAM}`;
  for (const [n, text] of Object.entries(memories(true))) { fs.write(brain(base) + '/' + n, text, { ro: true }); tag(fs, brain(base) + '/' + n, n); }
  for (const n of BLOCK_NAMES) fs.write(brain(base) + '/' + n, '👾 block', { ro: true });
  bite(fs, 'ถูกลากไปขังใน /quarantine และโดนอุดสมองด้วยไฟล์ .block 5 ไฟล์');
}

// wake.sh: fails while the brain still has .block files in it (the story's "she doesn't wake up").
const WAKE = {
  wake(args, ctx, abs) {
    const dir = abs.slice(0, abs.lastIndexOf('/'));
    const b = this.fs.get(dir + '/brain');
    const names = b && b.t === 'd' ? Object.keys(b.kids) : [];
    const blocks = names.filter(n => n.endsWith('.block'));
    ctx.out('[wake.sh] กำลังปลุกน้องล่าม...\n[ OK ] โหลดโมดูลภาษาไทย\n[ OK ] เชื่อมต่อ terminal\n');
    this.flags.wakeTried = true;
    if (blocks.length) {
      ctx.out(`[FAIL] brain/: มีไฟล์ .block อุดอยู่ ${blocks.length} ไฟล์ น้องล่ามยังตื่นไม่ได้\n`);
      return 1;
    }
    ctx.out('[ OK ] brain/: โล่งแล้ว\n[ OK ] น้องล่ามตื่นแล้ว! 🐧\n');
    this.flags.woke = true;
    return 0;
  },
};

// Three months of helping ครูสมใจ (the time-skip scene): her new work is on the machine now.
function afterThreeMonths(fs) {
  fs.tree(S + '/kru_work', {
    'lesson_plans/': {
      'week01_ls_cd.txt': 'แผนการสอนสัปดาห์ที่ 1: ls กับ cd สอนด้วยเกมล่ามเชลล์',
      'week02_files.txt': 'แผนการสอนสัปดาห์ที่ 2: cp mv rm และการดูก่อนลบ',
      'week03_find.txt': 'แผนการสอนสัปดาห์ที่ 3: find และการอ่าน error',
    },
    'grades_2569_term2.csv': 'id,score\n1,19\n2,20\n3,17',
    'projects_backup/': { 'm4_1.zip': { content: 'zip', size: 48_000_000 }, 'm4_2.zip': { content: 'zip', size: 52_000_000 } },
    'thank_you.txt': 'ขอบใจมากนะที่ช่วยครูมาตลอดสามเดือน\nไปปลุกน้องล่ามได้แล้วจ้า — ครูสมใจ',
  });
  markKeep(fs, ['lesson_plans/week01_ls_cd.txt', 'lesson_plans/week02_files.txt', 'lesson_plans/week03_find.txt',
    'grades_2569_term2.csv', 'thank_you.txt'].map(p => S + '/kru_work/' + p));
}
