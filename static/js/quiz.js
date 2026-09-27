// Checkpoint quizzes (design doc: mastery gate). After phases 1-4, ป้าเซิร์ฟ -- the school server herself -- checks
// the player before opening the next zone: 5 questions drawn from the phase's bank, 4/5 (80%) to pass. Questions
// ask what a command does and what a real error means (the game's selling point). Every error line below is the
// exact text the game's shell prints.
const PICK = 5, PASS = 4;

export const CHECKPOINTS = {
  1: {
    title: 'เช็กพอยต์ 1: ภาษาไทยมั่วได้',
    intro: [
      ['serv', 'สวัสดีจ้ะ ป้าคือป้าเซิร์ฟ เครื่องเซิร์ฟเวอร์ของโรงเรียนนี้เอง'],
      ['serv', 'ก่อนป้าจะเปิดประตูโซนถัดไป ขอเช็กหน่อยว่าหนูจำคำสั่งที่น้องล่ามแปลให้ได้แค่ไหน ห้าข้อ ถูกสี่ข้อก็ผ่านจ้ะ'],
    ],
    pass: [['serv', 'เก่งมากจ้ะ ป้าเปิดประตูให้แล้ว ไปต่อได้เลย']],
    bank: [
      { id: '1a', q: 'คำสั่งนี้ทำอะไร?', code: 'ls', a: 'ดูรายชื่อไฟล์และโฟลเดอร์ในที่ที่อยู่ตอนนี้',
        x: ['เข้าไปในโฟลเดอร์', 'อ่านเนื้อหาในไฟล์', 'ลบไฟล์'], why: 'ls ย่อมาจาก list = ดูรายชื่อของในห้อง' },
      { id: '1b', q: 'อยากเข้าไปในโฟลเดอร์ teachers_room ต้องพิมพ์อะไร?', a: 'cd teachers_room',
        x: ['ls teachers_room', 'cat teachers_room', 'mv teachers_room'], why: 'cd = change directory = ย้ายไปอยู่ห้องอื่น', mono: true },
      { id: '1c', q: 'error นี้แปลว่าอะไร?', code: "mkdir: cannot create directory 'backup': File exists", a: 'มีชื่อ backup อยู่แล้ว สร้างซ้ำไม่ได้',
        x: ['ไม่มีสิทธิ์สร้างโฟลเดอร์', 'พิมพ์ชื่อคำสั่งผิด', 'โฟลเดอร์ backup ว่างเปล่า'], why: 'File exists = มีอยู่แล้ว' },
      { id: '1d', q: 'error นี้ "ใครบ่น"?', code: 'cat: letter.txt: No such file or directory', a: 'cat',
        x: ['letter.txt', 'ป้าเซิร์ฟ', 'sudo'], why: 'คำแรกก่อนเครื่องหมาย : คือโปรแกรมที่บ่น ส่วนถัดมาคือเรื่องที่บ่น', mono: true },
      { id: '1e', q: 'หลังพิมพ์คำสั่งนี้ ไฟล์ homework.txt ที่เดิมเป็นยังไง?', code: 'cp homework.txt backup/', a: 'ยังอยู่ที่เดิม และมีสำเนาอยู่ใน backup ด้วย',
        x: ['หายไป เพราะย้ายไปอยู่ใน backup', 'ถูกเปลี่ยนชื่อเป็น backup', 'ถูกลบ'], why: 'cp = copy ก๊อปไป ต้นฉบับยังอยู่' },
      { id: '1f', q: 'หลังพิมพ์คำสั่งนี้ ไฟล์ class_photo.jpg ที่เดิมเป็นยังไง?', code: 'mv class_photo.jpg photos/', a: 'หายไปจากที่เดิม เพราะย้ายไปอยู่ใน photos',
        x: ['ยังอยู่ที่เดิม และมีสำเนาใน photos', 'ถูกลบทิ้งถาวร', 'กลายเป็นโฟลเดอร์ชื่อ photos'], why: 'mv = move ย้ายของ ที่เดิมจึงไม่มีแล้ว' },
      { id: '1g', q: 'เจอ error นี้ ควรทำยังไง?', code: 'cat: exam.txt: Permission denied', a: 'ถ้ามีสิทธิ์จริง ใช้ sudo นำหน้า: sudo cat exam.txt',
        x: ['พิมพ์ cat exam.txt ซ้ำจนกว่าจะเปิดได้', 'สร้างไฟล์ใหม่ชื่อ exam.txt', 'เปลี่ยนชื่อไฟล์ก่อน'], why: 'Permission denied = ไม่มีสิทธิ์ ของนี้เป็นของ root ต้องใช้ sudo' },
      { id: '1h', q: 'error นี้หมายความว่าอะไร?', code: 'Failed to power off system via logind: Interactive authentication required.', a: 'ปิดเครื่องต้องใช้สิทธิ์ผู้ดูแล ต้องพิมพ์ sudo poweroff',
        x: ['คอมพังแล้ว', 'ต้องปิดโปรแกรมอื่นให้หมดก่อน', 'สะกด poweroff ผิด'], why: 'authentication required = ต้องยืนยันว่าเป็นผู้ดูแล' },
      { id: '1i', q: 'error นี้แปลว่าอะไร?', code: 'bash: sl: command not found', a: 'ไม่มีคำสั่งชื่อ sl (น่าจะพิมพ์ ls สลับตัว)',
        x: ['ไม่มีไฟล์ชื่อ sl', 'ไม่มีสิทธิ์ใช้ sl', 'ห้องนี้ว่างเปล่า'], why: 'command not found = bash หาคำสั่งชื่อนี้ไม่เจอ' },
    ],
  },
  2: {
    title: 'เช็กพอยต์ 2: ห้องเรียนน้องล่าม',
    intro: [
      ['serv', 'มาถึงประตูที่สองแล้ว คราวนี้หนูพิมพ์คำสั่งเองมาตลอด ป้าภูมิใจนะ'],
      ['serv', 'ป้าจะถามเรื่องทางเดินในเครื่อง ที่อยู่ของไฟล์ และตัวเลือกหน้าขีด ห้าข้อเหมือนเดิมจ้ะ'],
    ],
    pass: [['serv', 'ผ่านจ้ะ! หนูเดินในเครื่องป้าเป็นแล้ว ประตูเปิดแล้วนะ']],
    bank: [
      { id: '2a', q: 'คำสั่งนี้ทำอะไร?', code: 'pwd', a: 'บอกว่าตอนนี้เราอยู่ที่ไหน (ที่อยู่เต็ม)',
        x: ['เปลี่ยนรหัสผ่าน', 'ดูรายชื่อไฟล์', 'กลับบ้าน'], why: 'pwd = print working directory' },
      { id: '2b', q: 'ตอนนี้อยู่ที่ /home/student/school/lab แล้วพิมพ์ cd .. จะไปอยู่ที่ไหน?', a: '/home/student/school',
        x: ['/home/student', '/ (ราก)', '/home/student/school/lab'], why: '.. = ห้องที่ใหญ่กว่าหนึ่งชั้น', mono: true },
      { id: '2c', q: 'เครื่องหมาย ~ หมายถึงที่ไหน?', a: 'บ้านของเรา (/home/student)',
        x: ['ราก / ของเครื่อง', 'ห้องที่อยู่ตอนนี้', 'ห้องที่เพิ่งออกมา'], why: '~ = บ้าน ไม่ว่าอยู่ตรงไหน cd ~ ก็กลับบ้าน' },
      { id: '2d', q: 'ข้อไหนเป็น "ที่อยู่เต็ม" (ใช้ได้จากทุกที่)?', a: '/home/student/school/library',
        x: ['school/library', '../library', 'library'], why: 'ที่อยู่เต็มขึ้นต้นด้วย / (เริ่มจากราก) อันอื่นนับจากที่ที่อยู่ตอนนี้', mono: true },
      { id: '2e', q: 'error นี้แปลว่าอะไร?', code: "cp: -r not specified; omitting directory 'club'", a: 'club เป็นโฟลเดอร์ ต้องใส่ -r ถึงจะก๊อปทั้งโฟลเดอร์',
        x: ['ไม่มี club อยู่ในห้องนี้', 'ไม่มีสิทธิ์ก๊อป club', 'โฟลเดอร์ปลายทางไม่มี'], why: 'omitting directory = ข้ามโฟลเดอร์ไป เพราะไม่ได้บอก -r' },
      { id: '2f', q: 'อยากเปลี่ยนชื่อไฟล์ rpeort.txt เป็น report.txt ใช้คำสั่งไหน?', a: 'mv rpeort.txt report.txt',
        x: ['cp rpeort.txt report.txt', 'rm rpeort.txt report.txt', 'cat rpeort.txt report.txt'], why: 'Linux ไม่มีคำสั่งเปลี่ยนชื่อ ใช้ mv ย้ายไปเป็นชื่อใหม่', mono: true },
      { id: '2g', q: 'ในคำสั่งนี้ จุด . หมายถึงอะไร?', code: 'find . -name "*grade*"', a: 'เริ่มค้นจากห้องที่อยู่ตอนนี้ และทุกห้องข้างใน',
        x: ['ค้นทั้งเครื่อง', 'หาไฟล์ที่มีจุดในชื่อ', 'จบคำสั่ง'], why: 'คำแรกหลัง find คือ "ค้นที่ไหน" . = ที่นี่' },
      { id: '2h', q: 'อยากรู้ว่า ls มีตัวเลือกอะไรบ้าง ต้องพิมพ์อะไร?', a: 'ls --help',
        x: ['ls ?', 'ls help', 'ls -options'], why: '--help เป็นตัวเลือกที่คำสั่งเกือบทุกตัวมี (ls help จะไปหาไฟล์ชื่อ help)', mono: true },
      { id: '2i', q: 'คำสั่งนี้ทำอะไร?', code: 'cat lab/notes/day1.txt', a: 'อ่านไฟล์ day1.txt ใน lab/notes ได้เลย ไม่ต้อง cd เข้าไปก่อน',
        x: ['ต้อง cd เข้า lab/notes ก่อนถึงจะใช้ได้', 'สร้างไฟล์ day1.txt', 'ย้าย day1.txt ออกมา'], why: 'ใส่ path ไปกับชื่อไฟล์ได้เลย' },
    ],
  },
  3: {
    title: 'เช็กพอยต์ 3: ชื่อจริง ไส้ภาษาคน',
    intro: [
      ['serv', 'ประตูที่สามแล้วจ้ะ ต่อจากนี้น้องล่ามจะช่วยไม่ได้แล้ว หนูต้องพิมพ์เองทุกตัว'],
      ['serv', 'ป้าเลยต้องมั่นใจก่อนว่าหนูรู้จักตัวเลือกพวกนี้ และอ่าน error เองได้ ห้าข้อนะ'],
    ],
    pass: [['serv', 'ผ่านแล้ว! ต่อจากนี้ยากขึ้นนะ แต่ป้าเชื่อว่าหนูไหว']],
    bank: [
      { id: '3a', q: 'ls -a ต่างจาก ls ยังไง?', a: 'แสดงไฟล์ที่ซ่อนอยู่ (ชื่อขึ้นต้นด้วยจุด) ด้วย',
        x: ['แสดงเฉพาะโฟลเดอร์', 'แสดงแบบละเอียด มีขนาดไฟล์', 'เรียงตามตัวอักษร'], why: '-a = all ทั้งหมด รวมไฟล์ที่ซ่อน' },
      { id: '3b', q: 'คำสั่งนี้ทำอะไร? (ตอนนี้ยังไม่มีโฟลเดอร์ projects)', code: 'mkdir -p projects/2569/science', a: 'สร้างโฟลเดอร์ซ้อนกันครบทุกชั้นในทีเดียว',
        x: ['error เพราะยังไม่มี projects', 'สร้างแค่โฟลเดอร์ science', 'สร้างไฟล์ชื่อ science'], why: '-p = parents สร้างชั้นบนที่ยังไม่มีให้ด้วย' },
      { id: '3c', q: 'พิมพ์ mkdir โดยไม่ใส่ -p แล้วเจอ error นี้ เพราะอะไร?', code: "mkdir: cannot create directory 'projects/2569/science': No such file or directory", a: 'ชั้นบน (projects/2569) ยังไม่มี',
        x: ['มีโฟลเดอร์ science อยู่แล้ว', 'ไม่มีสิทธิ์สร้าง', 'ชื่อโฟลเดอร์ห้ามมีตัวเลข'], why: 'No such file or directory ตรงนี้หมายถึงทางไปยังไม่มี' },
      { id: '3d', q: 'คำสั่งนี้หาอะไร?', code: 'find . -type f -size +50M', a: 'ไฟล์ (ไม่เอาโฟลเดอร์) ที่ใหญ่กว่า 50MB',
        x: ['ไฟล์ที่เล็กกว่า 50MB', 'โฟลเดอร์ชื่อ 50M', 'ไฟล์ใหญ่แล้วลบทิ้งเลย'], why: '-type f = ไฟล์, -size +50M = ใหญ่กว่า 50 เมก' },
      { id: '3e', q: 'ก่อนลบไฟล์หลายไฟล์ ควรทำอะไรก่อน?', a: 'ดูรายชื่อที่จะโดนลบก่อน เช่น ls หรือ find แบบยังไม่ลบ',
        x: ['ลบเลย ลบผิดก็กู้คืนได้', 'ใส่ -f ให้ลบเร็วขึ้น', 'ปิดเครื่องก่อน'], why: 'rm ในเครื่องจริงไม่มีถังขยะ ลบแล้วหายเลย' },
      { id: '3f', q: 'เจอ error นี้ ต้องแก้ยังไง?', code: "rm: cannot remove 'mua.bin': Permission denied", a: 'ไฟล์เป็นของ root ต้องใช้ sudo rm mua.bin',
        x: ['ใส่ -r', 'ไฟล์ไม่มีอยู่จริง พิมพ์ชื่อใหม่', 'cd ออกไปก่อนแล้วลบ'], why: 'Permission denied = ไม่มีสิทธิ์' },
      { id: '3g', q: 'error นี้แปลว่าอะไร?', code: "rm: cannot remove 'club': Is a directory", a: 'club เป็นโฟลเดอร์ rm เฉยๆ ลบไม่ได้',
        x: ['ไม่มี club อยู่', 'ไม่มีสิทธิ์ลบ club', 'club เป็นไฟล์ว่าง'], why: 'Is a directory = อันนี้เป็นโฟลเดอร์นะ' },
      { id: '3h', q: 'หลงอยู่ลึกมากใน stage/costumes/hats/red อยากกลับบ้านทีเดียว พิมพ์อะไร?', a: 'cd ~',
        x: ['cd ..', 'cd /', 'ls ~'], why: '~ = บ้าน cd ~ กลับบ้านได้จากทุกที่ (cd .. ถอยแค่ชั้นเดียว)', mono: true },
    ],
  },
  4: {
    title: 'เช็กพอยต์ 4: เป๊ะทุกตัว',
    intro: [
      ['serv', 'ประตูสุดท้ายก่อนลงโรงงานท่อใต้ดินแล้วจ้ะ'],
      ['serv', 'ข้างล่างนั่นทุกตัวอักษรมีความหมาย ป้าขอดูหน่อยว่าหนูอ่าน error เองได้จริงไหม'],
    ],
    pass: [['serv', 'สุดยอด! หนูอ่าน error เองได้แล้ว ลงไปหาพี่รูทได้เลยจ้ะ']],
    bank: [
      { id: '4a', q: 'พิมพ์ cat my notes.txt แล้วเจอ error สองบรรทัดนี้ เพราะอะไร?', code: 'cat: my: No such file or directory\ncat: notes.txt: No such file or directory', a: 'ชื่อมีช่องว่าง cat เลยเข้าใจว่าเป็นสองไฟล์',
        x: ['ไฟล์ my notes.txt ไม่มีอยู่จริง', 'ไม่มีสิทธิ์อ่าน', 'cat อ่านไฟล์ .txt ไม่ได้'], why: 'ช่องว่างแบ่งคำ ต้องครอบชื่อด้วย "..."' },
      { id: '4b', q: 'จะอ่านไฟล์ชื่อ my notes.txt ต้องพิมพ์ข้อไหน?', a: 'cat "my notes.txt"',
        x: ['cat my notes.txt', '"cat my notes.txt"', 'cat my_notes.txt'], why: 'ครอบเฉพาะชื่อที่มีช่องว่างด้วย "..."', mono: true },
      { id: '4c', q: 'error นี้แปลว่าอะไร?', code: 'bash: LS: command not found', a: 'Linux แยกตัวเล็กตัวใหญ่ คำสั่งคือ ls ตัวเล็ก',
        x: ['เครื่องไม่มีคำสั่ง ls', 'ห้องนี้ว่าง', 'ต้องใช้ sudo'], why: 'LS กับ ls เป็นคนละชื่อกันในสายตาของ Linux' },
      { id: '4d', q: 'error นี้แปลว่าอะไร?', code: "mv: cannot move 'club' to a subdirectory of itself, 'club/old'", a: 'จะย้ายโฟลเดอร์เข้าไปไว้ในตัวมันเอง ซึ่งทำไม่ได้',
        x: ['ไม่มีโฟลเดอร์ club/old', 'ไม่มีสิทธิ์ย้าย', 'club ว่างเปล่า'], why: 'subdirectory of itself = โฟลเดอร์ย่อยของตัวเอง (หลุมดำ)' },
      { id: '4e', q: 'บรรทัด [exit 0] หลังคำสั่ง หมายความว่าอะไร?', a: 'คำสั่งทำสำเร็จ (ถ้าไม่ใช่ 0 แปลว่ามีปัญหา)',
        x: ['คำสั่งพัง', 'ออกจากเกมแล้ว', 'ไม่มีไฟล์เลยสักไฟล์'], why: 'exit code 0 = สำเร็จ, เลขอื่น = ล้มเหลว' },
      { id: '4f', q: 'ตัวเลือก -i ใน rm -i ทำอะไร?', a: 'ถามยืนยันก่อนลบทีละไฟล์',
        x: ['ลบแบบไม่ถาม', 'ลบทั้งโฟลเดอร์', 'ลบเฉพาะไฟล์ที่ซ่อน'], why: '-i = interactive ถามก่อน' },
      { id: '4g', q: 'พิมพ์ cp scores.csv lab backup/ แล้วเจอ error นี้ ผลคืออะไร?', code: "cp: -r not specified; omitting directory 'lab'", a: 'scores.csv ก๊อปไปแล้ว แต่ lab ไม่ถูกก๊อป',
        x: ['ไม่มีอะไรถูกก๊อปเลย', 'ก๊อปครบทั้งสองอย่าง', 'lab ถูกลบ'], why: 'error บอกแค่ lab ที่ถูกข้าม ของอื่นทำไปแล้ว อ่านให้ครบว่าบ่นเรื่องอะไร' },
      { id: '4h', q: 'ls -l ต่างจาก ls ยังไง?', a: 'แสดงแบบละเอียด: สิทธิ์ เจ้าของ ขนาด วันที่',
        x: ['แสดงไฟล์ที่ซ่อน', 'แสดงแค่บรรทัดเดียว', 'ลบไฟล์ที่ยาวเกิน'], why: '-l = long listing' },
    ],
  },
};

// Lines ป้าเซิร์ฟ says during any quiz (fixed, so they can be voiced).
export const REACT = {
  right: ['ถูกต้องจ้ะ', 'เก่งมาก', 'ใช่เลย'],
  wrong: ['ยังไม่ใช่นะ อ่านคำอธิบายก่อน', 'ผิดไม่เป็นไร อ่านเหตุผลแล้วจำไว้นะ'],
  fail: ['ยังไม่ถึงสี่ข้อจ้ะ ทบทวนข้อที่พลาดแล้วลองใหม่ได้เลย ข้อสอบจะสุ่มใหม่ทุกรอบ'],
};

export const quizLines = () => [
  ...Object.values(CHECKPOINTS).flatMap(c => [...c.intro, ...c.pass]),
  ...Object.values(REACT).flat().map(t => ['serv', t]),
];

const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pickOne = a => a[Math.floor(Math.random() * a.length)];

// Runs one attempt in `box`. say(who, text) speaks on the stage. Resolves with the result.
export function runQuiz(cp, box, say) {
  const C = CHECKPOINTS[cp];
  const qs = shuffle(C.bank).slice(0, PICK).map(q => ({ ...q, opts: shuffle([q.a, ...q.x]) }));
  const answers = [];
  let i = 0;
  box.className = 'quiz show';
  for (const [who, t] of C.intro) say(who, t);

  return new Promise(resolve => {
    let keys = null;
    const onKey = e => keys?.(e);
    document.addEventListener('keydown', onKey, true);
    const done = r => { document.removeEventListener('keydown', onKey, true); box.abort = null; resolve(r); };
    box.abort = () => done(null);   // another level was opened meanwhile

    function question() {
      const q = qs[i];
      box.innerHTML = `<div class="qz">
        <div class="qz-top"><span>${esc(C.title)}</span><span>ข้อ ${i + 1}/${PICK}</span></div>
        <div class="qz-dots">${qs.map((_, k) => `<i class="${k < answers.length ? (answers[k].ok ? 'ok' : 'no') : k === i ? 'cur' : ''}"></i>`).join('')}</div>
        <div class="qz-q">${esc(q.q)}</div>
        ${q.code ? `<pre class="qz-code">${esc(q.code)}</pre>` : ''}
        <div class="qz-opts">${q.opts.map((o, k) => `<button data-k="${k}" class="${q.mono ? 'mono' : ''}"><b>${k + 1}</b><span>${esc(o)}</span></button>`).join('')}</div>
        <div class="qz-why"></div>
      </div>`;
      const btns = [...box.querySelectorAll('.qz-opts button')];
      const choose = k => {
        if (answers.length > i) return;
        const ok = q.opts[k] === q.a;
        answers.push({ id: q.id, q: q.q, chosen: q.opts[k], ok });
        btns.forEach((b, n) => {
          b.disabled = true;
          if (q.opts[n] === q.a) b.classList.add('right');
          else if (n === k) b.classList.add('wrong');
        });
        say('serv', pickOne(ok ? REACT.right : REACT.wrong));
        const why = box.querySelector('.qz-why');
        why.innerHTML = `<div class="${ok ? 'ok' : 'no'}">${ok ? '✓ ถูกต้อง' : '✗ ยังไม่ใช่'}</div><div>${esc(q.why)}</div>
          <button class="qz-next">${i + 1 < PICK ? 'ข้อต่อไป →' : 'ดูผล'}</button>`;
        const next = why.querySelector('.qz-next');
        next.focus();
        next.onclick = () => { i++; i < PICK ? question() : result(); };
        keys = e => { if (e.key === 'Enter') { e.preventDefault(); next.click(); } };
      };
      btns.forEach(b => { b.onclick = () => choose(+b.dataset.k); });
      keys = e => { const k = +e.key - 1; if (k >= 0 && k < btns.length) { e.preventDefault(); choose(k); } };
    }

    function result() {
      const score = answers.filter(a => a.ok).length;
      const passed = score >= PASS;
      const r = { cp, score, total: PICK, passed, answers };
      for (const [who, t] of passed ? C.pass : REACT.fail.map(t => ['serv', t])) say(who, t);
      const missed = qs.filter((q, k) => !answers[k].ok);
      box.innerHTML = `<div class="qz">
        <div class="qz-top"><span>${esc(C.title)}</span></div>
        <div class="qz-score ${passed ? 'ok' : 'no'}">${score}/${PICK}</div>
        <div class="qz-verdict">${passed ? '✅ ผ่านเช็กพอยต์ ประตูโซนถัดไปเปิดแล้ว' : `ต้องได้อย่างน้อย ${PASS} ข้อ (80%) ลองใหม่ได้ไม่จำกัด`}</div>
        ${missed.length ? `<div class="qz-review"><div class="label">ทบทวนข้อที่พลาด</div>${missed.map(q => `<div class="rv">
          <div>${esc(q.q)}</div>${q.code ? `<pre class="qz-code">${esc(q.code)}</pre>` : ''}
          <div>คำตอบ: <b>${esc(q.a)}</b></div><div class="muted">${esc(q.why)}</div></div>`).join('')}</div>` : ''}
        <div class="qz-btns">${passed ? '<button class="go">ไปต่อ →</button>' : '<button class="go">ลองใหม่ (สุ่มข้อใหม่)</button>'}
          <button class="back linkbtn">กลับไปเล่นด่านเดิม</button></div>
      </div>`;
      box.querySelector('.go').focus();
      keys = null;
      box.querySelector('.go').onclick = () => done({ ...r, next: passed ? 'continue' : 'retry' });
      box.querySelector('.back').onclick = () => done({ ...r, next: 'back' });
    }
    question();
  });
}
