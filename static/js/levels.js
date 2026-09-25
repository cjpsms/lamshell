// Level data. Each level builds its own world; check(g) looks at the state of the world, not the exact text typed.
// g = { fs, sh, res (last exec result), hist: [results], out: all stdout so far, err: all stderr so far }
import { HOME } from './vfs.js';

const S = HOME + '/school';

// ---- helpers for checks ----
const ranOk = (g, name, pred = () => true) => g.hist.some(r => r.cmds.some(c => c.name === name && c.code === 0 && pred(c)));
const sawOut = (g, s) => g.hist.some(r => r.stdout.includes(s));
const sawErr = (g, s) => g.hist.some(r => r.stderr.includes(s));
const lastOut = g => (g.res ? g.res.stdout.replace(/\x1b\[[0-9;]*m/g, '').trim() : '');

// ---- shared worlds ----
function school(fs, extra = {}) {
  fs.tree(S, {
    'homework.txt': 'การบ้านคณิต ม.4/2: แบบฝึกหัดข้อ 1-20 ส่งวันศุกร์',
    'class_photo.jpg': { content: '\xff\xd8\xff\xe0 JFIF รูปรุ่น ม.4/2', size: 2_400_000 },
    'photos/': { 'trip_kanchanaburi.jpg': { content: 'jpg', size: 1_800_000 } },
    'teachers_room/': {
      'letter.txt': 'ถึงนักเรียนที่มาเช้าที่สุด\nครูทำไฟล์เกรดหาย ช่วยด้วย!\nไวรัสมันซ่อนไว้ที่ไหนสักแห่งในเครื่อง\n— ครูสมใจ',
    },
    'virus.exe': '👾 ฮ่าๆๆ ข้าคือไวรัสมั่วซั่ว!',
    'old/': {
      '2568/': { 'term2/': { 'attendance.txt': 'รายชื่อเข้าเรียน' } },
      '2569/': { 'term1/': { 'grades.txt': 'เกรดวิทยาการคำนวณ ม.4/2\nเลขที่ 1  A\nเลขที่ 2  B+' } },
    },
    ...extra,
  });
}

const P1_ALIASES = {
  'การบ้าน': 'homework.txt', 'รูปรุ่น': 'class_photo.jpg', 'รูปหมู่': 'class_photo.jpg',
  'ห้องครู': 'teachers_room', 'ห้องพักครู': 'teachers_room', 'จดหมาย': 'letter.txt',
  'ไวรัส': 'virus.exe', 'เกรด': 'grades (ไฟล์ชื่อมีคำว่า grade อยู่ลึกใน old/)', 'ข้อสอบ': 'exam.txt',
  'ที่หลบภัย': 'backup', 'อัลบั้มรูป': 'photos',
};

const EXAM = 'ข้อสอบกลางภาค วิทยาการคำนวณ ม.4\nข้อ 1. คำสั่งใดใช้ดูรายชื่อไฟล์?\n(ก) ls  (ข) cd  (ค) rm  (ง) ปิดคอมดิ';

export const PHASES = {
  1: { name: 'ภาษาไทยมั่วได้', prompt: 'ภาษาคน>', lam: 'น้องล่ามแข็งแรงเต็มที่ ฟังภาษาไทยได้หมด' },
  2: { name: 'อังกฤษบ้านๆ', prompt: 'eng>', lam: 'น้องล่ามโดนกัดโมดูลภาษาไทย ฟังได้แค่อังกฤษง่ายๆ' },
  3: { name: 'ชื่อจริง ไส้ภาษาคน', prompt: 'cmd>', lam: 'น้องล่ามเสียงแหบ แปลได้แค่ "ไส้ใน"' },
  4: { name: 'เป๊ะทุกตัว', prompt: '$', lam: 'น้องล่ามหลับไปฟื้นพลัง เหลือแค่สมุดถอดรหัส' },
  B: { name: 'ท่อ ถัง และสายพาน', prompt: '$', lam: 'พี่รูทพาลงโรงงานท่อใต้ดิน' },
};

export const LEVELS = [
  // ================= PHASE 1 =================
  {
    id: '1-1', phase: 1, title: 'ตื่นมาในห้องคอม', place: 'ห้องคอม ม.4/2 — 07:12 น.', cwd: S,
    setup: fs => school(fs), aliases: P1_ALIASES,
    intro: [
      ['lam', 'เฮ้! เราชื่อน้องล่าม เป็นล่ามประจำเครื่องป้าเซิร์ฟ 🐧'],
      ['lam', 'เมื่อคืนไวรัสมั่วซั่วบุกมา จอเลยเหลือแต่ดำๆ แบบนี้ ไม่ต้องกลัวนะ ที่นี่ลองผิดได้ ไม่มีวันพัง'],
      ['lam', 'บอกเรามาเป็นภาษาไทยเลยว่าอยากทำอะไร เช่น อยากรู้ว่าในห้องนี้มีอะไรบ้าง'],
    ],
    mission: 'สำรวจว่าไวรัสทิ้งอะไรไว้ในห้องนี้บ้าง',
    hint1: ['ls'], solution: 'ls', cards: ['ls'],
    check: g => ranOk(g, 'ls'),
    outro: [['lam', 'เห็นไหม! คำสั่งจริงคือ ls (ย่อมาจาก list) คนใช้ Linux จริงพิมพ์แค่ 2 ตัวนี้เอง ...เอ๊ะ virus.exe คืออะไรน่ะ?!']],
  },
  {
    id: '1-2', target: S + '/teachers_room', phase: 1, title: 'ไปห้องพักครู', place: 'ห้องคอม ม.4/2', cwd: S,
    setup: fs => school(fs), aliases: P1_ALIASES,
    intro: [['kru', 'ฮัลโหล~ ครูสมใจเองจ้า มาหาครูที่ห้องพักครูหน่อย มีเรื่องด่วน!']],
    mission: 'เข้าไปในห้องพักครู (teachers_room)',
    hint1: ['cd'], solution: 'cd teachers_room', cards: ['cd'],
    check: g => g.sh.cwd === S + '/teachers_room',
    outro: [['lam', 'cd ย่อมาจาก change directory = ย้ายไปอยู่ในโฟลเดอร์อื่น สังเกตไหมว่า prompt เปลี่ยนเป็น ~/school/teachers_room แล้ว']],
  },
  {
    id: '1-3', phase: 1, title: 'จดหมายจากครู', place: 'ห้องพักครู', cwd: S + '/teachers_room',
    setup: fs => school(fs), aliases: P1_ALIASES,
    intro: [['lam', 'ครูไม่อยู่แฮะ แต่มีจดหมายวางไว้บนโต๊ะ ลองให้เราอ่านให้ฟังสิ']],
    mission: 'อ่านจดหมายที่ครูทิ้งไว้',
    hint1: ['cat'], solution: 'cat letter.txt', cards: ['cat'],
    check: g => sawOut(g, 'ช่วยด้วย'),
    outro: [['lam', 'cat = แสดงเนื้อหาไฟล์ออกมาบนจอ (มาจาก concatenate แต่จำง่ายๆ ว่าแมวอ่านจดหมายให้ฟัง 🐱)'], ['kru', 'ไฟล์เกรดหายจริงๆ นะ! แต่ก่อนอื่นเก็บไฟล์สำคัญให้ปลอดภัยก่อน']],
  },
  {
    id: '1-4', phase: 1, title: 'สร้างที่หลบภัย', place: 'ห้องคอม ม.4/2', cwd: S,
    setup: fs => school(fs), aliases: P1_ALIASES,
    intro: [['lam', 'ไวรัสกำลังลาม! เราต้องมีโฟลเดอร์ไว้หลบภัย ตั้งชื่อว่า backup ดีไหม'], ['lam', 'สร้างเสร็จแล้วลองสั่งสร้างซ้ำอีกรอบนะ อยากให้ดูว่าเครื่องจะบ่นว่าอะไร']],
    mission: 'สร้างโฟลเดอร์ชื่อ backup แล้วลองสั่งสร้างซ้ำอีกรอบ ดูว่าเครื่องบ่นว่าอะไร',
    hint1: ['mkdir'], solution: 'mkdir backup  (แล้วสั่งซ้ำอีกที)', cards: ['mkdir'],
    check: g => g.fs.isDir(S + '/backup') && sawErr(g, 'File exists'),
    nudge: g => g.fs.isDir(S + '/backup') && 'สร้างได้แล้ว! ทีนี้ลองสั่งสร้าง backup ซ้ำอีกรอบดูสิ เครื่องจะบ่นว่าอะไร',
    outro: [['lam', 'mkdir = make directory แล้ว error เมื่อกี้อ่านแบบนี้: mkdir (ใครบ่น) : backup (เรื่องอะไร) : File exists (เพราะมีอยู่แล้ว) ง่ายนิดเดียว!']],
  },
  {
    id: '1-5', phase: 1, title: 'สำรองการบ้าน', place: 'ห้องคอม ม.4/2', cwd: S,
    setup: fs => { school(fs); fs.mkdirp(S + '/backup'); }, aliases: P1_ALIASES,
    intro: [['lam', 'การบ้านของทั้งห้องอยู่ใน homework.txt ก๊อปเก็บไว้ในที่หลบภัยก่อนไวรัสมาแก้!']],
    mission: 'ก๊อปการบ้าน (homework.txt) ไปไว้ในโฟลเดอร์ backup โดยต้นฉบับยังอยู่',
    hint1: ['cp'], solution: 'cp homework.txt backup/', cards: ['cp'],
    check: g => g.fs.isFile(S + '/backup/homework.txt') && g.fs.isFile(S + '/homework.txt'),
    fail: g => !g.fs.isFile(S + '/homework.txt') && 'การบ้านต้นฉบับหายไปจากที่เดิม! ภารกิจให้ก๊อป (ต้นฉบับต้องอยู่) ไม่ใช่ย้าย กด "ย้อนเวลา" แล้วลองใหม่',
    outro: [['lam', 'cp = copy ต้องบอกสองอย่างเสมอ: เอาอะไร แล้วไปไว้ที่ไหน']],
  },
  {
    id: '1-6', phase: 1, title: 'ย้ายรูปรุ่น', place: 'ห้องคอม ม.4/2', cwd: S,
    setup: fs => school(fs), aliases: P1_ALIASES,
    intro: [['virus', 'หึหึ... รูปรุ่นนี่ดูน่าอร่อยจัง 👾'], ['lam', 'ไม่นะ! ย้ายรูปรุ่นไปไว้ในอัลบั้ม photos ด่วน!']],
    mission: 'ย้ายรูปรุ่น (class_photo.jpg) ไปไว้ในโฟลเดอร์ photos',
    hint1: ['mv'], solution: 'mv class_photo.jpg photos/', cards: ['mv'],
    check: g => g.fs.isFile(S + '/photos/class_photo.jpg') && !g.fs.exists(S + '/class_photo.jpg'),
    nudge: g => g.fs.isFile(S + '/photos/class_photo.jpg') && g.fs.exists(S + '/class_photo.jpg') && 'ก๊อปไปไว้ใน photos แล้ว แต่รูปต้นฉบับยังวางอยู่ที่เดิมให้ไวรัสกิน! ก๊อป = ของเดิมยังอยู่ ภารกิจนี้ต้อง "ย้าย"',
    outro: [['lam', 'mv = move ต่างจาก cp ตรงที่ของเดิมหายไปจากที่เก่าเลย']],
  },
  {
    id: '1-7', phase: 1, title: 'ตามหาไฟล์เกรด', place: 'ห้องคอม ม.4/2', cwd: S,
    setup: fs => school(fs), aliases: P1_ALIASES,
    intro: [['kru', 'ไฟล์เกรดของครูชื่อมีคำว่า grade อยู่ แต่ไวรัสซ่อนไว้ลึกมาก หาให้ครูหน่อยนะ']],
    mission: 'หาไฟล์เกรดของครู (ชื่อมีคำว่า grade) ว่าซ่อนอยู่ตรงไหน',
    hint1: ['find', '-name'], solution: 'find . -name "*grade*"', cards: ['find'],
    check: g => sawOut(g, 'old/2569/term1/grades.txt'),
    outro: [['kru', 'เจอแล้ว! อยู่ที่ old/2569/term1/grades.txt นี่เอง ขอบใจมากจ้า'], ['lam', 'find = ค้นหา *grade* แปลว่า "อะไรก็ได้ที่มีคำว่า grade อยู่ตรงกลาง"']],
  },
  {
    id: '1-8', phase: 1, title: 'ห้องข้อสอบลับ', place: 'ห้องพักครู', cwd: S + '/teachers_room', password: 'pass123',
    setup: fs => { school(fs); fs.write(S + '/teachers_room/exam.txt', EXAM, { priv: true }); }, aliases: P1_ALIASES,
    intro: [
      ['kru', 'ไวรัสอาจแก้ข้อสอบพรุ่งนี้! ช่วยเช็กไฟล์ exam.txt ให้ครูที'],
      ['root', 'หวัดดี พี่รูทเอง ม.6 ผู้ดูแลระบบ ไฟล์นั้นล็อกไว้ อ่านได้แค่แอดมิน ถ้าโดนปฏิเสธก็ขอใช้สิทธิ์แอดมินนะ รหัสผ่านคือ pass123'],
    ],
    mission: 'อ่านไฟล์ข้อสอบ exam.txt (ถ้าไม่มีสิทธิ์ ให้ขอใช้สิทธิ์แอดมิน รหัส pass123)',
    hint1: ['cat', 'sudo'], solution: 'sudo cat exam.txt   (รหัส pass123)', cards: ['sudo'],
    check: g => sawOut(g, 'ข้อสอบกลางภาค'),
    outro: [['root', 'sudo = "ทำในนามแอดมิน" ตอนพิมพ์รหัสจะไม่มีอะไรขึ้นจอ เป็นเรื่องปกติ พลังมากต้องรับผิดชอบมากนะน้อง']],
  },
  {
    id: '1-9', phase: 1, boss: true, title: 'มินิบอส: ปิดคอมดิ!', place: 'ห้องคอม ม.4/2', cwd: S, password: 'pass123',
    setup: fs => school(fs), aliases: P1_ALIASES,
    intro: [
      ['virus', 'ข้ายังอยู่! virus.exe จะกินเครื่องนี้ทั้งเครื่อง 👾👾'],
      ['lam', 'ลบไวรัสทิ้ง แล้วปิดเครื่องตัดการเชื่อมต่อเลย! (ปิดเครื่องต้องใช้สิทธิ์แอดมินนะ รหัส pass123)'],
    ],
    mission: 'ลบ virus.exe แล้วปิดเครื่อง',
    hint1: ['rm', 'sudo', 'poweroff'], solution: 'rm virus.exe  แล้ว  sudo poweroff', cards: ['rm', 'poweroff'],
    check: g => !g.fs.exists(S + '/virus.exe') && g.sh.flags.poweroff,
    outro: [['lam', 'รอดแล้ว!! rm = remove (ลบแล้วหายเลย ไม่มีถังขยะ) poweroff = ปิดเครื่อง ครบ 10 คำสั่งแล้ว เก่งมาก!'], ['virus', '...ข้าจะกลับมา และคราวหน้าข้าจะกัดล่ามของเจ้า 👾']],
  },

  // ================= PHASE 2 =================
  {
    id: '2-1', phase: 2, mode: 'run', title: 'ห้องสมุดเงียบ', place: 'เช้าวันที่สอง — ห้องสมุด', cwd: S + '/library',
    setup: fs => fs.tree(S + '/library', { 'books/': { 'linux_for_kids.txt': 'หนังสือ' }, 'old_computers/': {}, 'returned.txt': 'หนังสือที่คืนแล้ว: 12 เล่ม' }),
    intro: [
      ['lam', 'แค่กๆ... เมื่อคืนไวรัสกัดโมดูลภาษาไทยเราไปแล้ว ตอนนี้เราฟังออกแค่ภาษาอังกฤษง่ายๆ'],
      ['lam', 'บรรณารักษ์อยากรู้ว่ามีอะไรในห้องสมุดบ้าง ลองสั่งเป็นภาษาอังกฤษดูสิ'],
    ],
    mission: 'ดูว่าในห้องสมุดมีอะไรบ้าง (พิมพ์เป็นภาษาอังกฤษ)',
    hint1: ['ls'], solution: 'ls', cards: [],
    check: g => ranOk(g, 'ls'),
    outro: [['lam', 'จำไว้นะ list → ls คนเขาย่อให้สั้น']],
  },
  {
    id: '2-2', target: S + '/lab', phase: 2, mode: 'run', title: 'หลงทางในตึก', place: 'ทางเดินชั้น 2', cwd: S,
    setup: fs => fs.tree(S, { 'lab/': { 'notes/': {} }, 'library/': {}, 'gym/': {} }),
    intro: [['lam', 'ต่อไปไปห้องแล็บ (lab) กัน ลองสั่งให้พาไปดูสิ']],
    mission: 'ไปที่ห้องแล็บ (lab)',
    hint1: ['cd'], solution: 'cd lab', cards: [],
    check: g => g.sh.cwd === S + '/lab',
    outro: [['lam', 'goto → cd  ถ้าหลงเข้าห้องผิด cd .. ถอยออกมาได้เสมอ ดู prompt ข้างหน้าว่าตอนนี้อยู่ไหน']],
  },
  {
    id: '2-3', phase: 2, mode: 'run', title: 'สมุดบันทึกแล็บ', place: 'ห้องแล็บ', cwd: S + '/lab',
    setup: fs => fs.tree(S + '/lab', { 'notes/': { 'day1.txt': 'บันทึกวันที่ 1: ผลการทดลองถูกไวรัสแก้เป็น 999 ทุกช่อง!' }, 'beaker.txt': 'บีกเกอร์ 20 ใบ' }),
    intro: [['lam', 'บันทึกการทดลองอยู่ใน notes ลองสั่งอ่าน notes ดูก่อน']],
    mission: 'อ่านบันทึกการทดลองวันแรก (อยู่ใน notes)',
    hint1: ['cat'], solution: 'cat notes/day1.txt', cards: [],
    check: g => sawOut(g, 'บันทึกวันที่ 1'),
    outro: [['lam', 'notes เป็นโฟลเดอร์ cat เลยบ่นว่า Is a directory ต้องบอกไฟล์ข้างในแบบ notes/day1.txt']],
  },
  {
    id: '2-4', phase: 2, mode: 'run', title: 'ชมรมใหม่', place: 'ห้องชมรม', cwd: S,
    setup: fs => fs.tree(S, { 'club/': { 'members.txt': 'สมาชิก 8 คน' } }),
    intro: [['lam', 'ชมรมหุ่นยนต์อยากได้โฟลเดอร์ใหม่ ลองสร้างชื่อ club ดูก่อนนะ แล้วค่อยสร้างชื่อ robot_club']],
    mission: 'สร้างโฟลเดอร์ใหม่ชื่อ robot_club',
    hint1: ['mkdir'], solution: 'mkdir robot_club', cards: [],
    check: g => g.fs.isDir(S + '/robot_club'),
    outro: [['lam', 'newfolder → mkdir ต่อจากนี้เราจะแค่บอกว่าหมายถึงคำสั่งไหน แต่จะไม่รันให้แล้วนะ ต้องพิมพ์เอง!']],
  },
  {
    id: '2-5', phase: 2, mode: 'suggest', title: 'สำรองทั้งชมรม', place: 'ห้องชมรม', cwd: S,
    setup: fs => fs.tree(S, { 'club/': { 'members.txt': 'สมาชิก 8 คน', 'plan.txt': 'แผนสร้างหุ่นยนต์เก็บขยะ' } }),
    intro: [['lam', '(เสียงแหบลง) ต่อจากนี้เราบอกได้แค่ว่าหมายถึงคำสั่งอะไร ต้องพิมพ์เองนะ'], ['lam', 'ก๊อปทั้งโฟลเดอร์ club เป็น club_bak เผื่อไวรัสมาลบ']],
    mission: 'ก๊อปโฟลเดอร์ club ทั้งโฟลเดอร์ไปเป็น club_bak',
    hint1: ['cp', '-r'], solution: 'cp -r club club_bak', cards: [],
    check: g => g.fs.isFile(S + '/club_bak/members.txt') && g.fs.isFile(S + '/club_bak/plan.txt'),
    outro: [['lam', 'ก๊อปโฟลเดอร์ต้องใส่ -r (recursive = ลงไปทุกชั้น) ไม่งั้น cp จะบอกว่า omitting directory']],
  },
  {
    id: '2-6', phase: 2, mode: 'suggest', title: 'เปลี่ยนชื่อที่ไวรัสแกล้ง', place: 'ห้องชมรม', cwd: S,
    setup: fs => fs.tree(S, { 'rpeort.txt': 'รายงานชมรมหุ่นยนต์ ภาคเรียนที่ 1', 'club/': {} }),
    intro: [['virus', 'ข้าสลับตัวอักษรชื่อไฟล์รายงานเล่นๆ อ่านออกไหมล่ะ 👾'], ['lam', 'rpeort.txt ต้องเป็น report.txt!']],
    mission: 'เปลี่ยนชื่อ rpeort.txt เป็น report.txt',
    hint1: ['mv'], solution: 'mv rpeort.txt report.txt', cards: [],
    check: g => g.fs.isFile(S + '/report.txt') && !g.fs.exists(S + '/rpeort.txt'),
    nudge: g => g.fs.isFile(S + '/report.txt') && g.fs.exists(S + '/rpeort.txt') && 'มี report.txt แล้ว แต่ rpeort.txt ชื่อผิดก็ยังอยู่ ภารกิจคือเปลี่ยนชื่อ ไม่ใช่ก๊อปเพิ่ม',
    outro: [['lam', 'mv ใช้เปลี่ยนชื่อได้ด้วย = ย้ายไปอยู่ที่เดิมแต่ชื่อใหม่']],
  },
  {
    id: '2-7', phase: 2, mode: 'suggest', title: 'ลบรังไวรัส', place: 'ห้องชมรม', cwd: S,
    setup: fs => fs.tree(S, { 'nest/': { 'egg1.mua': '👾', 'egg2.mua': '👾', 'egg3.mua': '👾' }, 'report.txt': 'รายงาน', 'club/': {} }),
    intro: [['lam', 'ไวรัสวางไข่ไว้ในโฟลเดอร์ nest! ลบทิ้งทั้งรังเลย แต่ของอื่นห้ามหายนะ']],
    mission: 'ลบโฟลเดอร์ nest ทั้งโฟลเดอร์ โดยของอื่นยังอยู่ครบ',
    hint1: ['rm', '-r'], solution: 'rm -r nest', cards: [],
    check: g => !g.fs.exists(S + '/nest') && g.fs.isFile(S + '/report.txt') && g.fs.isDir(S + '/club'),
    fail: g => (!g.fs.isFile(S + '/report.txt') || !g.fs.isDir(S + '/club')) && 'ของที่ไม่ใช่ไวรัสหายไปด้วย! กด "ย้อนเวลา" แล้วลองใหม่',
    outro: [['lam', 'delete → rm ลบโฟลเดอร์ต้องมี -r เหมือน cp เลย']],
  },
  {
    id: '2-8', phase: 2, mode: 'suggest', boss: true, title: 'มินิบอส: turnoff!', place: 'โรงยิม', cwd: S, password: 'pass123',
    setup: fs => fs.tree(S, { 'gym/': { 'locker_01/': { 'shoes.txt': 'รองเท้า' }, 'locker_12/': { 'mua_king.bin': '👑👾' }, 'balls/': {} }, 'library/': {} }),
    intro: [['virus', 'ราชาไวรัสมาแล้ว! หาข้าให้เจอสิ 👑👾'], ['lam', 'ค้นหาไฟล์ที่ชื่อมีคำว่า mua แล้วปิดเครื่องรีบูตเลย! (รหัสแอดมิน pass123)']],
    mission: 'ค้นหาไฟล์ที่ชื่อมีคำว่า mua ให้เจอ แล้วปิดเครื่อง',
    hint1: ['find', 'sudo', 'poweroff'], solution: 'find . -name "*mua*"  แล้ว  sudo poweroff', cards: [],
    check: g => sawOut(g, 'mua_king.bin') && g.sh.flags.poweroff,
    outro: [['lam', 'turnoff ไม่มีใน Linux จริง เราเลยช่วยเดาให้ Ubuntu ก็ใช้กลไก command_not_found_handle แบบนี้แหละ'], ['virus', 'หนอย... คราวนี้ข้ากัดเสียงล่ามแน่ 👾']],
  },

  // ================= PHASE 3 =================
  {
    id: '3-1', phase: 3, title: 'รังลับหลังเวที', place: 'ห้องเก็บของหลังเวที', cwd: S + '/stage',
    setup: fs => fs.tree(S + '/stage', { '.virus_nest/': { 'egg.mua': '👾' }, 'costumes/': {}, 'props.txt': 'อุปกรณ์ละคร' }),
    intro: [['lam', '(เสียงแหบ) เราแปลได้แค่ "ไส้ใน" แล้วนะ ชื่อคำสั่งต้องพิมพ์เองเท่านั้น'], ['lam', 'ไวรัสซ่อนรังไว้ในห้องนี้ ลองดูไฟล์ที่ซ่อนอยู่สิ']],
    mission: 'ดูรายชื่อไฟล์ รวมไฟล์ที่ซ่อนอยู่ด้วย',
    hint1: ['ls', '-a'], solution: 'ls -a', cards: ['ls -a'],
    check: g => sawOut(g, '.virus_nest'),
    outro: [['lam', 'ไฟล์ที่ชื่อขึ้นต้นด้วยจุดคือไฟล์ซ่อน! -a = all']],
  },
  {
    id: '3-2', target: HOME, phase: 3, title: 'ทางกลับบ้าน', place: 'ลึกในกองชุดละคร', cwd: S + '/stage/costumes/hats/red',
    setup: fs => fs.tree(S + '/stage/costumes/hats/red', { 'hat.txt': 'หมวกแดง' }),
    intro: [['lam', 'หลงเข้ามาลึกเกิน! ลองถอยออกไปทีละชั้น หรือกลับบ้านทีเดียวเลยก็ได้']],
    mission: 'กลับบ้าน (~)',
    hint1: ['cd ..', 'cd ~'], solution: 'cd ~', cards: ['cd ..'],
    check: g => g.sh.cwd === HOME,
    outro: [['lam', 'cd .. = ถอยหนึ่งชั้น, cd ~ หรือ cd เฉยๆ = กลับบ้าน']],
  },
  {
    id: '3-3', phase: 3, title: 'ตู้เอกสารซ้อนชั้น', place: 'ห้องธุรการ', cwd: S,
    setup: fs => fs.tree(S, { 'projects/': {} }),
    intro: [['kru', 'ครูอยากได้โฟลเดอร์ projects/2569/science ไว้เก็บโครงงาน']],
    mission: 'สร้างโฟลเดอร์ projects/2569/science (ซ้อนหลายชั้น)',
    hint1: ['mkdir', '-p'], solution: 'mkdir -p projects/2569/science', cards: ['mkdir -p'],
    check: g => g.fs.isDir(S + '/projects/2569/science'),
    outro: [['lam', '-p = parents สร้างชั้นที่ขาดให้ครบในทีเดียว']],
  },
  {
    id: '3-4', phase: 3, title: 'ถ่ายเอกสารทั้งตู้', place: 'ห้องชมรม', cwd: S,
    setup: fs => fs.tree(S, { 'club/': { 'members.txt': 'สมาชิก', 'robots/': { 'arm.txt': 'แขนกล' } }, 'backup/': {} }),
    intro: [['lam', 'สำรองงานชมรมทั้งโฟลเดอร์เข้า backup กัน']],
    mission: 'ก๊อปโฟลเดอร์ club ทั้งโฟลเดอร์ไปไว้ใน backup',
    hint1: ['cp', '-r'], solution: 'cp -r club backup/', cards: ['cp -r'],
    check: g => g.fs.isFile(S + '/backup/club/robots/arm.txt'),
    outro: [['lam', 'ทั้งโฟลเดอร์ = -r จำไว้ใช้ได้ทั้ง cp และ rm']],
  },
  {
    id: '3-5', phase: 3, title: 'ป้ายชื่อผิด', place: 'ห้องธุรการ', cwd: S,
    setup: fs => fs.tree(S, { 'report.exe': 'รายงานผลการเรียน (จริงๆ เป็นข้อความธรรมดา)' }),
    intro: [['virus', 'ข้าเปลี่ยนนามสกุลรายงานเป็น .exe ให้ดูน่ากลัวเล่น 👾']],
    mission: 'เปลี่ยนชื่อ report.exe เป็น report.txt',
    hint1: ['mv'], solution: 'mv report.exe report.txt', cards: [],
    check: g => g.fs.isFile(S + '/report.txt') && !g.fs.exists(S + '/report.exe'),
    nudge: g => g.fs.isFile(S + '/report.txt') && g.fs.exists(S + '/report.exe') && 'มี report.txt แล้ว แต่ report.exe ยังอยู่ เปลี่ยนชื่อ = ของเดิมต้องไม่เหลือ',
    outro: [['lam', 'รู้ไหม นามสกุลไม่ได้กำหนดชนิดไฟล์ใน Linux มันเป็นแค่ส่วนหนึ่งของชื่อ']],
  },
  {
    id: '3-6', phase: 3, title: 'นักสืบขนาดไฟล์', place: 'ห้องเก็บของ', cwd: S + '/storage',
    setup: fs => bigFiles(fs),
    intro: [['kru', 'ดิสก์เต็ม! ครูเซฟงานไม่ได้เลย ไวรัสปั๊มไฟล์ใหญ่ๆ ไว้แน่ๆ'], ['lam', 'ลองหาไฟล์ที่ใหญ่เกิน 50MB ดูก่อน ยังไม่ต้องลบนะ']],
    mission: 'ค้นหาไฟล์ที่ใหญ่เกิน 50MB',
    hint1: ['find', '-size', '-type'], solution: 'find . -type f -size +50M', cards: ['find -size'],
    check: g => ['junk1.iso', 'junk2.mp4', 'yearbook_video.mp4'].every(f => sawOut(g, f)),
    outro: [['lam', '-size +50M = ใหญ่เกิน 50MB เจอ 3 ไฟล์ ...แต่เดี๋ยวนะ yearbook_video.mp4 นี่มันวิดีโอรุ่นนี่!']],
  },
  {
    id: '3-7', phase: 3, title: 'ลบไฟล์ใหญ่ (ดูก่อนลบ)', place: 'ห้องเก็บของ', cwd: S + '/storage',
    setup: fs => bigFiles(fs),
    intro: [['kru', 'ลบไฟล์ขยะใหญ่ๆ ให้ครูทีนะ'], ['lam', 'ก่อนลบเราจะโชว์รายชื่อให้ดูก่อนทุกครั้ง อ่านดีๆ ก่อนกด y นะ']],
    mission: 'ลบไฟล์ขยะที่ใหญ่เกิน 50MB แต่ห้ามลบวิดีโอรุ่น (yearbook_video.mp4)',
    hint1: ['rm', 'find -delete'], solution: 'rm junk1.iso junk2.mp4', cards: [],
    check: g => !g.fs.exists(S + '/storage/junk1.iso') && !g.fs.exists(S + '/storage/junk2.mp4') && g.fs.exists(S + '/storage/yearbook_video.mp4'),
    fail: g => !g.fs.exists(S + '/storage/yearbook_video.mp4') && 'วิดีโอรุ่นหายไปแล้ว!! บนเครื่องจริงไม่มีปุ่มย้อนเวลานะ กด "ย้อนเวลา" แล้วลองใหม่',
    outro: [['lam', 'เยี่ยม! "ดูก่อนลบ" คือนิสัยมือโปร คำสั่งแบบมือโปรคือ find . -type f -size +50M -name "junk*" -delete']],
  },
  {
    id: '3-8', phase: 3, boss: true, title: 'มินิบอส: ห้องเซิร์ฟเวอร์', place: 'หน้าห้องเซิร์ฟเวอร์', cwd: S, password: 'pass123',
    setup: fs => fs.tree(S, {
      'server_room/': {
        '__ro': true,
        'system.log': '07:01 INFO boot ok\n07:02 ERROR ไฟล์แปลกปลอมชื่อ mua.bin กำลังกิน CPU 99%\n07:03 ERROR mua.bin copy ตัวเองไปทั่ว',
        'mua.bin': '👾👾👾',
        'router.cfg': 'config',
      },
    }),
    intro: [['root', 'ห้องเซิร์ฟเวอร์เป็นของ root ดูได้ แต่แก้ต้องใช้ sudo (รหัส pass123)'], ['lam', 'เข้าไปอ่าน log หาชื่อไวรัส ลบมัน แล้วปิดเครื่อง!']],
    mission: 'เข้าห้องเซิร์ฟเวอร์ อ่าน system.log หาชื่อไวรัส ลบมัน แล้วปิดเครื่อง',
    hint1: ['cd', 'cat', 'sudo rm', 'sudo poweroff'], solution: 'cd server_room → cat system.log → sudo rm mua.bin → sudo poweroff', cards: [],
    check: g => !g.fs.exists(S + '/server_room/mua.bin') && g.fs.exists(S + '/server_room/router.cfg') && g.sh.flags.poweroff,
    fail: g => !g.fs.exists(S + '/server_room/router.cfg') && 'ลบ router.cfg ไปด้วย เน็ตทั้งโรงเรียนล่ม! กด "ย้อนเวลา"',
    outro: [['virus', 'อ๊าก! แต่ข้ากัดล่ามจนหลับไปแล้ว คราวนี้เจ้าต้องสู้คนเดียว 👾'], ['lam', 'ง่วง... จัง... ฝากสมุดไว้นะ... zzZ']],
  },

  // ================= PHASE 4 =================
  {
    id: '4-1', phase: 4, title: 'สะกดผิดนิดเดียว', place: 'คืนก่อนสอบ — ห้องคอมปิดไฟ', cwd: S,
    setup: fs => fs.tree(S, { 'backup/': {}, 'club/': {}, 'lab/': {}, 'library/': {}, 'photos/': {}, 'teachers_room/': {} }),
    intro: [
      ['root', 'น้องล่ามหลับไปฟื้นพลังแล้ว เหลือแต่สมุดถอดรหัสทิ้งไว้ (ปุ่ม 📖 ใต้ error)'],
      ['root', 'จากนี้ไม่มีใครแปลให้ พิมพ์ผิดก็จะเห็นแบบที่คนใช้ Linux จริงเห็น ตัวเลขใน [ ] คือ exit code: 0 = สำเร็จ'],
      ['root', 'ลองก่อนเลย: ดูว่าในห้องมีอะไร'],
    ],
    mission: 'ดูว่าในห้องมีอะไรบ้าง (พิมพ์คำสั่งจริงเอง)',
    hint1: ['ls'], solution: 'ls', cards: [],
    check: g => ranOk(g, 'ls'),
    outro: [['root', '127 แปลว่า "ไม่มีคำสั่งนี้ในโลก" และ Linux แยกตัวเล็กตัวใหญ่ LS กับ ls ไม่เหมือนกัน']],
  },
  {
    id: '4-2', phase: 4, title: 'ไฟล์ชื่อมีช่องว่าง', place: 'ห้องพักครู', cwd: S + '/teachers_room',
    setup: fs => fs.tree(S + '/teachers_room', { 'my notes.txt': 'โน้ตครูสมใจ: พรุ่งนี้สอบ 9 โมง ห้อง 402', 'letter.txt': 'จดหมาย' }),
    intro: [['kru', 'ครูตั้งชื่อไฟล์ว่า my notes.txt มีช่องว่างด้วยนะ อ่านให้ครูที']],
    mission: 'อ่านไฟล์ my notes.txt',
    hint1: ['cat', '"..."'], solution: 'cat "my notes.txt"', cards: ['"ชื่อมีช่องว่าง"'],
    check: g => sawOut(g, 'พรุ่งนี้สอบ'),
    outro: [['root', 'ช่องว่างแบ่งคำ cat เลยนึกว่ามี 2 ไฟล์ my กับ notes.txt ครอบด้วย "..." ให้เป็นชื่อเดียว']],
  },
  {
    id: '4-3', target: S + '/exam_room2', phase: 4, title: 'ประตูหลอก', place: 'ทางเดินห้องสอบ', cwd: S,
    setup: fs => fs.tree(S, { 'exam_room': 'ฮ่าๆ ประตูหลอก! นี่คือไฟล์ ไม่ใช่ห้อง — ไวรัสมั่วซั่ว', 'exam_room2/': { 'seats.txt': 'ผังที่นั่งสอบ' } }),
    intro: [['virus', 'ห้องสอบอยู่ทางนี้~ เชิญเข้ามาเลย 👾']],
    mission: 'เข้าไปในห้องสอบตัวจริง',
    hint1: ['cd', 'ls'], solution: 'cd exam_room2', cards: [],
    check: g => g.sh.cwd === S + '/exam_room2',
    outro: [['root', 'Not a directory = อันนั้นเป็นไฟล์ เข้าไปข้างในไม่ได้ ls ดูก่อนช่วยได้เยอะ (โฟลเดอร์จะเป็นสีฟ้า)']],
  },
  {
    id: '4-4', phase: 4, title: 'สร้างแต่ลืมตั้งชื่อ', place: 'ห้องธุรการ', cwd: S,
    setup: fs => fs.tree(S, { 'submit/': {} }),
    intro: [['kru', 'เตรียมโฟลเดอร์ส่งงาน submit/m4/room2 ให้ห้อง ม.4/2 หน่อยจ้า']],
    mission: 'สร้างโฟลเดอร์ submit/m4/room2',
    hint1: ['mkdir', '-p'], solution: 'mkdir -p submit/m4/room2', cards: [],
    check: g => g.fs.isDir(S + '/submit/m4/room2'),
    outro: [['root', 'missing operand = ขาดของที่ต้องใส่ต่อท้าย บอกให้ครบว่าจะสร้างอะไร']],
  },
  {
    id: '4-5', phase: 4, title: 'ก๊อปครึ่งๆ กลางๆ', place: 'ห้องแล็บ', cwd: S,
    setup: fs => fs.tree(S, { 'scores.csv': 'id,score\n1,18\n2,20', 'lab/': { 'result1.txt': 'ผลทดลอง 1' }, 'backup/': {} }),
    intro: [['kru', 'สำรองไฟล์คะแนน scores.csv กับโฟลเดอร์ lab ไว้ใน backup ก่อนไวรัสแก้!']],
    mission: 'ก๊อป scores.csv และโฟลเดอร์ lab ไปไว้ใน backup',
    hint1: ['cp', '-r'], solution: 'cp scores.csv backup/  และ  cp -r lab backup/', cards: [],
    check: g => g.fs.isFile(S + '/backup/scores.csv') && g.fs.isFile(S + '/backup/lab/result1.txt'),
    outro: [['root', 'missing destination = ลืมบอกปลายทาง, -r not specified = ลืมบอกว่าเอาทั้งโฟลเดอร์ สองอันนี้เจอบ่อยสุดแล้ว']],
  },
  {
    id: '4-6', phase: 4, title: 'หลุมดำ', place: 'ห้องชมรม', cwd: S,
    setup: fs => fs.tree(S, { 'club/': { 'members.txt': 'สมาชิก', 'old/': {} } }),
    intro: [['virus', 'เก็บ club เข้าไปไว้ใน club/old สิ เรียบร้อยดีออก 👾'], ['kru', 'ครูแค่อยากให้เก็บโฟลเดอร์ club เป็นชื่อ archive_club นะ']],
    mission: 'ย้ายโฟลเดอร์ club ไปเป็น archive_club',
    hint1: ['mv'], solution: 'mv club archive_club', cards: [],
    check: g => g.fs.isFile(S + '/archive_club/members.txt') && !g.fs.exists(S + '/club'),
    nudge: g => g.fs.isDir(S + '/archive_club') && g.fs.exists(S + '/club') && 'archive_club มีแล้ว แต่ club ยังอยู่ ครูให้ย้าย ไม่ใช่ก๊อป',
    outro: [['root', 'ย้ายโฟลเดอร์เข้าไปในตัวเองไม่ได้ เหมือนพยายามใส่กล่องลงในตัวมันเอง']],
  },
  {
    id: '4-7', phase: 4, title: 'อ่านคู่มือเป็น', place: 'ห้องคอม', cwd: S,
    setup: fs => fs.tree(S, { 'homework.txt': 'การบ้าน', 'big_video.mp4': { content: 'x', size: 88_000_000 }, 'photos/': {} }),
    intro: [['root', 'พี่จะไม่บอกแล้ว ls มีตัวเลือกดูรายละเอียดไฟล์ (ขนาด เจ้าของ) ลองหาจากคู่มือ ls --help เอง']],
    mission: 'ใช้ ls แบบแสดงรายละเอียด (ขนาดไฟล์ เจ้าของ)',
    hint1: ['ls --help', 'man ls'], solution: 'ls -l', cards: ['--help'],
    check: g => ranOk(g, 'ls', c => c.args.some(a => /^-[a-zA-Z]*l/.test(a))),
    outro: [['root', 'ติดตรงไหน --help ช่วยได้เสมอ คนเก่งไม่ได้จำทุกอย่าง แต่รู้ว่าต้องไปหาที่ไหน']],
  },
  {
    id: '4-8', phase: 4, boss: true, title: 'มินิบอส: ตู้เซฟข้อสอบ', place: 'ห้องธุรการ', cwd: S, password: 'pass123',
    setup: fs => fs.tree(S, { 'vault/': { 'exam.txt': { content: EXAM, priv: true }, 'answer_key.txt': { content: 'เฉลย', priv: true }, 'x.trap': '💣', 'drawer/': { 'y.trap': '💣', 'pens.txt': 'ปากกา' } } }),
    intro: [['root', 'ไวรัสวางกับดัก .trap ไว้ในตู้เซฟ vault อ่านข้อสอบให้ได้ ลบกับดักทุกอัน (ดูก่อนลบนะ) แล้วปิดเครื่อง รหัส pass123']],
    mission: 'อ่าน vault/exam.txt, ลบไฟล์ .trap ทั้งหมดใน vault (ของอื่นห้ามหาย) แล้วปิดเครื่อง',
    hint1: ['cat', 'sudo', 'find', 'rm -i', 'poweroff'], solution: 'sudo cat vault/exam.txt → find vault -name "*.trap" → rm -i vault/x.trap vault/drawer/y.trap → sudo poweroff', cards: [],
    check: g => sawOut(g, 'ข้อสอบกลางภาค') && !g.fs.exists(S + '/vault/x.trap') && !g.fs.exists(S + '/vault/drawer/y.trap') && g.fs.exists(S + '/vault/drawer/pens.txt') && g.fs.exists(S + '/vault/exam.txt') && g.sh.flags.poweroff,
    fail: g => (!g.fs.exists(S + '/vault/exam.txt') || !g.fs.exists(S + '/vault/drawer/pens.txt')) && 'ลบของสำคัญไปด้วย! กด "ย้อนเวลา"',
    outro: [['root', 'ผ่านเฟส 4! ตอนนี้น้องอ่าน error เองได้แล้ว ต่อไปพี่จะสอนต่อคำสั่งหลายตัวเข้าด้วยกัน']],
  },

  // ================= BRIDGE =================
  {
    id: 'B1', phase: 'B', title: 'นับหัวไวรัส', place: 'ห้องใต้ดิน: โรงงานท่อ', cwd: S + '/.virus_nest',
    setup: fs => nest(fs),
    intro: [
      ['root', 'รังไวรัสมีไฟล์เยอะจนนับไม่ไหว ls ออกมาเต็มจอเลย'],
      ['root', 'เราจะต่อ "ท่อ" | (Shift + \\) ให้ผลของ ls ไหลไปเข้าเครื่องนับ wc -l (นับบรรทัด)'],
    ],
    mission: 'นับว่าในรังมีไฟล์ทั้งหมดกี่ไฟล์ โดยต่อท่อ ls เข้า wc -l',
    hint1: ['|', 'wc -l'], solution: 'ls | wc -l', cards: ['|', 'wc -l'],
    check: g => lastOut(g) === '137',
    outro: [['root', '137 ตัว! ท่อ | คือเอาผลของคำสั่งซ้ายไปเป็นของกินของคำสั่งขวา']],
  },
  {
    id: 'B2', phase: 'B', title: 'กรองเอาแต่ตัวร้าย', place: 'โรงงานท่อ', cwd: S + '/.virus_nest',
    setup: fs => nest(fs),
    intro: [['root', 'ในรังมีไฟล์ log ปนอยู่ด้วย เราอยากรู้เฉพาะตัวที่ชื่อมี mua ใช้ grep กรองก่อน แล้วค่อยนับ']],
    mission: 'นับเฉพาะไฟล์ที่ชื่อมีคำว่า mua (ต่อท่อ 2 ต่อ)',
    hint1: ['grep', '|', 'wc -l'], solution: 'ls | grep mua | wc -l', cards: ['grep'],
    check: g => lastOut(g) === '89' && g.res.line.includes('|'),
    outro: [['root', 'ต่อท่อกี่ต่อก็ได้ ข้อมูลไหลจากซ้ายไปขวาเหมือนสายพาน']],
  },
  {
    id: 'B3', phase: 'B', title: 'ปิดเสียงบ่น', place: 'ทั้งเครื่อง', cwd: HOME,
    setup: fs => fs.tree('/var/backups', { '.old/': { 'flag.txt': 'FLAG{2>/dev/null_คือหลุมดำ}' } }),
    intro: [['root', 'ไวรัสซ่อน flag.txt ไว้ที่ไหนสักแห่งในเครื่อง ลองค้นทั้งเครื่องตั้งแต่ / ดูเลย']],
    mission: 'หา flag.txt ทั้งเครื่อง โดยให้จอสะอาด ไม่มีคำบ่น Permission denied',
    hint1: ['find /', '2>/dev/null'], solution: 'find / -name flag.txt 2>/dev/null', cards: ['2>/dev/null'],
    check: g => g.res.stdout.includes('/var/backups/.old/flag.txt') && g.res.stderr === '',
    outro: [['root', '2> = ช่องข้อความบ่น (stderr) /dev/null = หลุมดำ ทิ้งลงไปแล้วหายเลย เหลือแต่ผลที่อยากได้']],
  },
  {
    id: 'B4', phase: 'B', title: 'เก็บใส่ถัง', place: 'เครื่องครูสมใจ', cwd: HOME,
    setup: fs => downloads(fs),
    intro: [['kru', 'ครูอยากได้ "รายชื่อไฟล์ใหญ่เกิน 50MB ใน Downloads" เป็นไฟล์ชื่อ big_list.txt ไว้เปิดดูทีหลัง'], ['root', 'ใช้ > เทผลลงไฟล์แทนที่จะขึ้นจอ']],
    mission: 'เก็บรายชื่อไฟล์ใน ~/Downloads ที่ใหญ่เกิน 50MB ลงไฟล์ big_list.txt',
    hint1: ['find', '-size', '>'], solution: 'find ~/Downloads -type f -size +50M > big_list.txt', cards: ['>'],
    check: g => {
      const t = g.fs.read(HOME + '/big_list.txt') || '';
      return ['movie_night.mp4', 'ubuntu.iso', 'old_backup.zip'].every(f => t.includes(f)) && !t.includes('song.mp3') && !t.includes('homework.pdf');
    },
    nudge: g => !g.fs.exists(HOME + '/big_list.txt') && /ubuntu\.iso/.test(g.res.stdout) && 'รายชื่อถูกแล้ว แต่ไหลขึ้นจอ ไม่ได้ลงไฟล์ ครูอยากได้เป็นไฟล์ big_list.txt',
    outro: [['root', 'สังเกตว่าไม่มีอะไรขึ้นจอ เพราะไหลลงไฟล์หมด ระวัง: > เขียนทับของเดิม >> ต่อท้าย']],
  },
  {
    id: 'B5', phase: 'B', title: 'สายพานสั่งงาน', place: 'เครื่องครูสมใจ', cwd: HOME,
    setup: fs => {
      downloads(fs);
      fs.write(HOME + '/big_list.txt', ['movie_night.mp4', 'ubuntu.iso', 'old_backup.zip'].map(f => HOME + '/Downloads/' + f).join('\n'));
    },
    intro: [['kru', 'ครูเช็กรายชื่อใน big_list.txt แล้ว ลบได้ทั้งหมดเลย'], ['root', 'xargs = สายพาน เอาทุกคำที่ไหลมาในท่อไปต่อท้ายคำสั่ง ดูรายการก่อนนะ แล้วค่อยส่งเข้า xargs rm']],
    mission: 'ลบทุกไฟล์ที่อยู่ในรายชื่อ big_list.txt โดยใช้ xargs',
    hint1: ['cat', '|', 'xargs rm'], solution: 'cat big_list.txt | xargs rm', cards: ['xargs'],
    check: g => !g.fs.exists(HOME + '/Downloads/ubuntu.iso') && !g.fs.exists(HOME + '/Downloads/movie_night.mp4') && !g.fs.exists(HOME + '/Downloads/old_backup.zip') && g.fs.exists(HOME + '/Downloads/song.mp3') && g.hist.some(r => r.line.includes('xargs')),
    fail: g => (!g.fs.exists(HOME + '/Downloads/song.mp3') || !g.fs.exists(HOME + '/Downloads/homework.pdf')) && 'ไฟล์ที่ไม่อยู่ในรายการหายไปด้วย! กด "ย้อนเวลา"',
    outro: [['root', 'ถ้า xargs จบด้วย [123] แปลว่ามีคำสั่งที่มันสั่งไปพังอย่างน้อยหนึ่งตัว และระวังชื่อไฟล์มีช่องว่าง xargs จะหั่นเป็นสองชื่อ'], ['root', 'จบด่านสะพานแล้ว! เฟส 5 (ภารกิจประยุกต์) กับบอสใหญ่กำลังตามมา']],
  },
];

function bigFiles(fs) {
  fs.tree(S + '/storage', {
    'junk1.iso': { content: '\x00junk', size: 734_003_200 },
    'junk2.mp4': { content: '\x00junk', size: 125_829_120 },
    'yearbook_video.mp4': { content: 'วิดีโอรุ่น ม.6 ปี 2569', size: 314_572_800 },
    'poster.png': { content: 'png', size: 3_145_728 },
    'notes.txt': 'รายการของในห้องเก็บของ',
  });
}

function nest(fs) {
  const spec = {};
  for (let i = 1; i <= 89; i++) spec[`mua_${String(i).padStart(3, '0')}.bin`] = '👾';
  for (let i = 1; i <= 48; i++) spec[`log_${String(i).padStart(3, '0')}.tmp`] = 'log';
  fs.tree(S + '/.virus_nest', spec);
}

function downloads(fs) {
  fs.tree(HOME + '/Downloads', {
    'movie_night.mp4': { content: 'mp4', size: 943_718_400 },
    'ubuntu.iso': { content: 'iso', size: 6_227_702_784 },
    'old_backup.zip': { content: 'zip', size: 125_829_120 },
    'song.mp3': { content: 'mp3', size: 5_242_880 },
    'homework.pdf': { content: 'pdf', size: 2_097_152 },
  });
}
