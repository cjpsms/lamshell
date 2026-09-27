// Piki — the game's own encyclopedia (a Wikipedia parody). One page per command or idea, never per level: it explains
// enough to solve every level, but the examples use other files, so the player still has to apply it to the mission.
// A page unlocks once the player has reached the level that introduces it (`at`).
//
// Page text mini-format: `code` -> inline code, [[id]] or [[id|label]] -> link to another page.
// Blocks: { p }, { code, out?, note? } (a terminal example), { rows: [[a, b], ...], head?: [a, b] }, { warn }.

export const PAGES = [
  {
    id: 'read-error', title: 'การอ่าน error', at: '1-4', short: 'วิธีอ่านข้อความ error ของ Linux',
    gui: 'กล่องข้อความแจ้งเตือนสีแดงของ Windows แต่เป็นตัวหนังสือบรรทัดเดียว',
    intro: 'เวลาคำสั่งทำไม่ได้ Linux จะพิมพ์ข้อความ error บอกเสมอ และเกือบทุกข้อความมีรูปแบบเดียวกัน ถ้าอ่านเป็น จะรู้เองว่าต้องแก้ตรงไหน โดยไม่ต้องถามใคร นี่คือทักษะที่สำคัญที่สุดของเกมนี้',
    sections: [
      ['รูปแบบ', [
        { p: 'ข้อความ error แบ่งด้วยเครื่องหมาย `:` (โคลอน) เป็น 3 ส่วน อ่านจากซ้ายไปขวา:' },
        { rows: [['ส่วนแรก', 'ใครบ่น — ชื่อโปรแกรมที่ทำไม่ได้ (เช่น `cat` `mkdir` หรือ `bash`)'], ['ส่วนกลาง', 'บ่นเรื่องอะไร — มักเป็นชื่อไฟล์หรือโฟลเดอร์ที่มีปัญหา'], ['ส่วนท้าย', 'เพราะอะไร — เหตุผล ส่วนนี้สำคัญที่สุด']] },
        { code: 'cat diary.txt', out: "cat: diary.txt: No such file or directory", note: 'cat บ่น / เรื่อง diary.txt / เพราะไม่มีไฟล์หรือโฟลเดอร์ชื่อนี้' },
        { p: 'ถ้าคำสั่งพิมพ์ผิดจนหาไม่เจอ คนบ่นจะเป็น `bash` (ตัวรับคำสั่ง) แทน เช่น `bash: sl: command not found`' },
        { p: 'บางครั้งจะมีบรรทัดที่สอง `Try \'mkdir --help\' for more information.` แปลว่า "ลองเปิดคู่มือดูนะ" ดู [[options|ตัวเลือกและ --help]]' },
      ]],
      ['เหตุผลที่เจอบ่อย', [
        { head: ['ข้อความท้าย', 'แปลว่า'], rows: [
          ['No such file or directory', 'ไม่มีไฟล์/โฟลเดอร์ชื่อนี้ (พิมพ์ชื่อผิด หรืออยู่ผิดที่) → `ls` ดูก่อน'],
          ['File exists', 'มีชื่อนี้อยู่แล้ว สร้างซ้ำไม่ได้'],
          ['Is a directory', 'อันนี้เป็นโฟลเดอร์ ใช้กับคำสั่งที่ทำกับไฟล์ไม่ได้'],
          ['Not a directory', 'อันนี้เป็นไฟล์ เข้าไปข้างในไม่ได้'],
          ['Permission denied', 'ไม่มีสิทธิ์ ของนี้เป็นของ root → ดู [[sudo]]'],
          ['command not found', 'ไม่มีคำสั่งชื่อนี้ (สะกดผิด ตัวใหญ่ตัวเล็กผิด หรือลืมเปลี่ยนภาษาคีย์บอร์ด)'],
          ['missing operand', 'ขาดของที่ต้องใส่ต่อท้าย เช่น ลืมบอกชื่อ'],
        ] },
      ]],
      ['ข้อควรจำ', [
        { p: 'Linux เงียบเมื่อทำสำเร็จ ถ้าพิมพ์แล้วไม่มีอะไรขึ้นเลย แปลว่าทำได้แล้ว มันจะพูดเฉพาะตอนมีปัญหา' },
        { p: 'error ไม่ได้แปลว่าเครื่องพัง มันคือเครื่องบอกทางให้ อ่านส่วนท้ายก่อนเสมอ' },
      ]],
    ],
  },
  {
    id: 'ls', title: 'ls', at: '1-1', short: 'ดูรายชื่อไฟล์และโฟลเดอร์', abbr: 'list',
    gui: 'เปิดโฟลเดอร์ใน File Explorer แล้วมองดูว่ามีอะไรบ้าง',
    intro: '`ls` แสดงรายชื่อของทุกอย่างในโฟลเดอร์ เป็นคำสั่งที่ใช้บ่อยที่สุด ทุกครั้งที่ไม่แน่ใจว่าตัวเองอยู่ไหนหรือมีอะไรบ้าง ให้ `ls` ก่อน',
    sections: [
      ['รูปแบบคำสั่ง', [
        { code: 'ls', note: 'ดูของในโฟลเดอร์ที่อยู่ตอนนี้' },
        { code: 'ls music', note: 'ดูของในโฟลเดอร์ music โดยไม่ต้องเข้าไป' },
      ]],
      ['สีของชื่อ', [
        { rows: [['สีฟ้า', 'โฟลเดอร์ (ห้อง) เข้าไปข้างในได้ด้วย [[cd]]'], ['สีขาว', 'ไฟล์ธรรมดา เปิดอ่านได้ด้วย [[cat]]'], ['สีเขียว', 'ไฟล์ที่รันได้ (โปรแกรม/สคริปต์) ดู [[run-script|./ รันไฟล์]]']] },
      ]],
      ['ตัวเลือกที่ใช้บ่อย', [
        { head: ['ตัวเลือก', 'ทำอะไร'], rows: [
          ['-a', 'all แสดงไฟล์ซ่อนด้วย (ไฟล์ที่ชื่อขึ้นต้นด้วยจุด เช่น `.secret`) ปกติ `ls` จะไม่แสดง'],
          ['-l', 'long แสดงแบบละเอียดทีละบรรทัด: สิทธิ์ เจ้าของ ขนาด วันที่'],
          ['-h', 'ใช้คู่กับ -l ให้ขนาดอ่านง่าย (1.2K 50M แทนตัวเลขไบต์ยาวๆ)'],
          ['-1', 'แสดงชื่อละบรรทัด'],
        ] },
        { p: 'ตัวเลือกรวมกันได้ `ls -la` = `ls -l -a`' },
        { code: 'ls -a', out: '.  ..  game.txt  music  .secret', note: '.secret โผล่มาแล้ว (เรียงตามชื่อโดยไม่นับจุด) และ . กับ .. ก็โผล่มาด้วย ดู [[path]]' },
      ]],
      ['error ที่เจอบ่อย', [
        { code: 'ls musci', out: "ls: cannot access 'musci': No such file or directory", note: 'ไม่มีโฟลเดอร์ชื่อนี้ สะกดผิด (musci / music)' },
        { code: 'ls /root', out: "ls: cannot open directory '/root': Permission denied", note: 'โฟลเดอร์ของ root ดูไม่ได้ถ้าไม่ใช้ [[sudo]]' },
      ]],
      ['ข้อควรระวัง', [
        { p: 'ถ้า `ls` แล้วไม่มีอะไรขึ้นเลย แปลว่าโฟลเดอร์ว่าง (หรือมีแต่ไฟล์ซ่อน ลอง `ls -a`)' },
      ]],
    ],
  },
  {
    id: 'cd', title: 'cd', at: '1-2', short: 'ย้ายไปอยู่โฟลเดอร์อื่น', abbr: 'change directory',
    gui: 'ดับเบิลคลิกเข้าโฟลเดอร์ / กดปุ่มย้อนขึ้นไปโฟลเดอร์แม่',
    intro: '`cd` พาเราเดินเข้า-ออกโฟลเดอร์ หลังเดินแล้ว prompt (ข้อความหน้าช่องพิมพ์) จะเปลี่ยนตามว่าเราอยู่ไหน',
    sections: [
      ['รูปแบบคำสั่ง', [
        { head: ['พิมพ์', 'ไปที่ไหน'], rows: [
          ['cd music', 'เข้าโฟลเดอร์ music ที่อยู่ในที่ปัจจุบัน'],
          ['cd music/rock', 'เข้าลึกหลายชั้นทีเดียว (music แล้วต่อ rock)'],
          ['cd ..', 'ถอยออกไปหนึ่งชั้น (โฟลเดอร์แม่)'],
          ['cd ../..', 'ถอยสองชั้น'],
          ['cd ~', 'กลับบ้าน (/home/student) จากทุกที่'],
          ['cd', 'พิมพ์เฉยๆ ก็กลับบ้านเหมือนกัน'],
          ['cd /home/student/music', 'ไปด้วยที่อยู่เต็ม ใช้ได้จากทุกที่'],
        ] },
        { p: 'รายละเอียดเรื่อง `..` `~` `/` ดู [[path|path และที่อยู่]]' },
      ]],
      ['error ที่เจอบ่อย', [
        { code: 'cd muisc', out: 'bash: cd: muisc: No such file or directory', note: 'ไม่มีโฟลเดอร์ชื่อนี้ในที่ที่อยู่ตอนนี้ → `ls` ดูชื่อที่ถูก' },
        { code: 'cd game.txt', out: 'bash: cd: game.txt: Not a directory', note: 'game.txt เป็นไฟล์ ไม่ใช่ห้อง เข้าไปไม่ได้ (ชื่อไฟล์เป็นสีขาวใน ls)' },
        { code: 'cd my music', out: 'bash: cd: too many arguments', note: 'ชื่อมีช่องว่าง cd เลยเห็นเป็นสองชื่อ → `cd "my music"` ดู [[quotes]]' },
        { code: 'cd /root', out: 'bash: cd: /root: Permission denied', note: 'ห้องของ root เข้าไม่ได้' },
      ]],
      ['ข้อควรระวัง', [
        { p: 'error ของ cd ขึ้นต้นด้วย `bash: cd:` เพราะ cd เป็นคำสั่งที่อยู่ในตัว bash เอง' },
        { p: 'หลงเมื่อไหร่ ดู prompt หรือพิมพ์ [[pwd]] แล้ว `cd ~` กลับบ้านไปเริ่มใหม่' },
      ]],
    ],
  },
  {
    id: 'cat', title: 'cat', at: '1-3', short: 'แสดงเนื้อหาไฟล์บนจอ', abbr: 'concatenate (ต่อกัน)',
    gui: 'ดับเบิลคลิกเปิดไฟล์ .txt ด้วย Notepad (แต่ดูอย่างเดียว แก้ไม่ได้)',
    intro: '`cat` พิมพ์ทุกบรรทัดในไฟล์ออกมาบนจอ ใช้อ่านไฟล์ข้อความ',
    sections: [
      ['รูปแบบคำสั่ง', [
        { code: 'cat game.txt', out: 'high score: 9000\nplayer: somchai' },
        { code: 'cat notes/today.txt', note: 'อ่านไฟล์ในโฟลเดอร์อื่นได้เลย ไม่ต้อง cd เข้าไป ดู [[path]]' },
        { code: 'cat a.txt b.txt', note: 'ใส่หลายไฟล์ จะพิมพ์ต่อกัน (นี่คือที่มาของชื่อ concatenate)' },
      ]],
      ['error ที่เจอบ่อย', [
        { code: 'cat gmae.txt', out: 'cat: gmae.txt: No such file or directory', note: 'ชื่อผิด' },
        { code: 'cat music', out: 'cat: music: Is a directory', note: 'music เป็นโฟลเดอร์ อ่านด้วย cat ไม่ได้ ใช้ `ls music` ดูข้างในแทน' },
        { code: 'cat secret.txt', out: 'cat: secret.txt: Permission denied', note: 'ไฟล์ของ root → `sudo cat secret.txt` ดู [[sudo]]' },
        { code: 'cat my notes.txt', out: 'cat: my: No such file or directory\ncat: notes.txt: No such file or directory', note: 'ชื่อมีช่องว่าง ต้องครอบ "..." ดู [[quotes]]' },
      ]],
    ],
  },
  {
    id: 'mkdir', title: 'mkdir', at: '1-4', short: 'สร้างโฟลเดอร์ใหม่', abbr: 'make directory',
    gui: 'คลิกขวา → New → Folder',
    intro: '`mkdir` สร้างโฟลเดอร์ใหม่ (สร้างไฟล์ไม่ได้ สร้างได้แค่โฟลเดอร์)',
    sections: [
      ['รูปแบบคำสั่ง', [
        { code: 'mkdir photos', note: 'สร้างโฟลเดอร์ photos ในที่ที่อยู่ตอนนี้ (สำเร็จจะเงียบ)' },
        { code: 'mkdir a b c', note: 'สร้างทีละหลายโฟลเดอร์' },
        { code: 'mkdir -p trip/2569/beach', note: 'สร้างซ้อนหลายชั้นทีเดียว แม้ trip ยังไม่มี' },
      ]],
      ['ตัวเลือก', [
        { rows: [['-p', 'parents สร้างชั้นบนที่ยังไม่มีให้ครบ และถ้ามีอยู่แล้วก็ไม่บ่น']] },
      ]],
      ['error ที่เจอบ่อย', [
        { code: 'mkdir photos', out: "mkdir: cannot create directory 'photos': File exists", note: 'มีชื่อนี้อยู่แล้ว' },
        { code: 'mkdir trip/2569/beach', out: "mkdir: cannot create directory 'trip/2569/beach': No such file or directory", note: 'ชั้นบน (trip/2569) ยังไม่มี → ใส่ `-p`' },
        { code: 'mkdir', out: "mkdir: missing operand\nTry 'mkdir --help' for more information.", note: 'ไม่ได้บอกว่าจะสร้างชื่ออะไร' },
      ]],
    ],
  },
  {
    id: 'cp', title: 'cp', at: '1-5', short: 'ก๊อปไฟล์/โฟลเดอร์ (ต้นฉบับยังอยู่)', abbr: 'copy',
    gui: 'Ctrl+C แล้ว Ctrl+V',
    intro: '`cp` ทำสำเนา ของเดิมยังอยู่ที่เดิม ต้องบอกสองอย่างเสมอ: เอาอะไร (ต้นทาง) และไปไว้ที่ไหน (ปลายทาง)',
    sections: [
      ['รูปแบบคำสั่ง', [
        { code: 'cp game.txt saves/', note: 'ก๊อป game.txt ไปไว้ในโฟลเดอร์ saves (ชื่อเดิม)' },
        { code: 'cp game.txt game_old.txt', note: 'ก๊อปเป็นไฟล์ใหม่อีกชื่อ ในที่เดียวกัน' },
        { code: 'cp a.txt b.txt saves/', note: 'หลายไฟล์พร้อมกัน: ตัวสุดท้ายคือปลายทางเสมอ และต้องเป็นโฟลเดอร์' },
        { code: 'cp -r music saves/', note: 'ก๊อปทั้งโฟลเดอร์ (และทุกอย่างข้างใน) ต้องมี -r' },
      ]],
      ['ตัวเลือก', [
        { rows: [['-r', 'recursive ก๊อปทั้งโฟลเดอร์ ลงไปทุกชั้น ถ้าไม่ใส่ cp จะข้ามโฟลเดอร์']] },
      ]],
      ['error ที่เจอบ่อย', [
        { code: 'cp music saves/', out: "cp: -r not specified; omitting directory 'music'", note: 'music เป็นโฟลเดอร์ ลืม -r (ถ้าก๊อปหลายอย่าง ของอื่นยังก๊อปไปแล้ว มีแค่ตัวนี้ที่ถูกข้าม)' },
        { code: 'cp gmae.txt saves/', out: "cp: cannot stat 'gmae.txt': No such file or directory", note: '"cannot stat" = หาต้นทางไม่เจอ ชื่อผิด' },
        { code: 'cp game.txt', out: "cp: missing destination file operand after 'game.txt'\nTry 'cp --help' for more information.", note: 'ลืมปลายทาง' },
        { code: 'cp game.txt nowhere/', out: "cp: cannot create regular file 'nowhere/': Not a directory", note: 'ปลายทางไม่มีอยู่ หรือไม่ใช่โฟลเดอร์' },
      ]],
      ['ข้อควรระวัง', [
        { p: 'ถ้าปลายทางมีไฟล์ชื่อเดียวกันอยู่แล้ว cp จะเขียนทับเงียบๆ ไม่ถาม' },
        { p: 'cp ≠ mv: ถ้าอยากให้ของเดิมหายไปจากที่เก่า ใช้ [[mv]]' },
      ]],
    ],
  },
  {
    id: 'mv', title: 'mv', at: '1-6', short: 'ย้าย หรือเปลี่ยนชื่อ', abbr: 'move',
    gui: 'ลากไฟล์ไปวางอีกโฟลเดอร์ (Ctrl+X, Ctrl+V) หรือคลิกขวา → Rename',
    intro: '`mv` ย้ายของ ของเดิมจะหายไปจากที่เก่า Linux ไม่มีคำสั่ง "เปลี่ยนชื่อ" แยก เพราะการย้ายไปที่เดิมแต่ชื่อใหม่ ก็คือการเปลี่ยนชื่อ',
    sections: [
      ['รูปแบบคำสั่ง', [
        { code: 'mv game.txt saves/', note: 'ย้าย game.txt เข้าไปใน saves' },
        { code: 'mv gmae.txt game.txt', note: 'เปลี่ยนชื่อ (ปลายทางยังไม่มีอยู่ = ใช้เป็นชื่อใหม่)' },
        { code: 'mv music old_music', note: 'เปลี่ยนชื่อโฟลเดอร์ ไม่ต้องใส่ -r' },
        { code: 'mv a.txt b.txt saves/', note: 'ย้ายหลายไฟล์ ตัวสุดท้ายคือปลายทาง' },
      ]],
      ['error ที่เจอบ่อย', [
        { code: 'mv gmae.txt saves/', out: "mv: cannot stat 'gmae.txt': No such file or directory", note: 'หาต้นทางไม่เจอ' },
        { code: 'mv music music/old', out: "mv: cannot move 'music' to a subdirectory of itself, 'music/old'", note: 'ย้ายโฟลเดอร์เข้าไปในตัวเองไม่ได้ เหมือนยัดกล่องใส่ตัวมันเอง' },
      ]],
      ['ข้อควรระวัง', [
        { p: 'ถ้าปลายทางเป็นชื่อไฟล์ที่มีอยู่แล้ว ไฟล์นั้นจะถูกทับหายไป' },
        { p: 'นามสกุลไฟล์ (.txt .exe) เป็นแค่ส่วนหนึ่งของชื่อ เปลี่ยนด้วย mv ได้เลย เนื้อในไม่เปลี่ยน' },
      ]],
    ],
  },
  {
    id: 'find', title: 'find', at: '1-7', short: 'ค้นหาไฟล์ตามเงื่อนไข',
    gui: 'ช่องค้นหาของ File Explorer แต่กำหนดเงื่อนไขได้ละเอียดกว่า (ขนาด ชนิด)',
    intro: '`find` เดินค้นทุกโฟลเดอร์ย่อยตั้งแต่จุดที่บอก แล้วพิมพ์ path ของทุกอย่างที่ตรงเงื่อนไข',
    sections: [
      ['รูปแบบคำสั่ง', [
        { p: 'เรียงแบบนี้เสมอ: `find <ค้นที่ไหน> <เงื่อนไข...>` ส่วนแรกคือจุดเริ่มค้น ไม่ใช่ชื่อที่หา' },
        { code: 'find . -name "*.mp3"', out: './music/song1.mp3\n./music/rock/song2.mp3', note: '. = เริ่มจากที่นี่ แล้วลงไปทุกชั้น' },
        { code: 'find / -name "photo*"', note: 'ค้นทั้งเครื่อง (จะมีคำบ่น Permission denied เยอะ ดู [[devnull|2>/dev/null]])' },
      ]],
      ['เงื่อนไขที่ใช้บ่อย', [
        { head: ['เงื่อนไข', 'ความหมาย'], rows: [
          ['-name "แบบชื่อ"', 'ชื่อตรงแบบนี้ (ตัวใหญ่ตัวเล็กต้องตรง) ใช้ `*` ได้ ดู [[wildcard]]'],
          ['-iname "แบบชื่อ"', 'เหมือน -name แต่ไม่สนตัวใหญ่ตัวเล็ก'],
          ['-type f', 'เอาเฉพาะไฟล์'],
          ['-type d', 'เอาเฉพาะโฟลเดอร์'],
          ['-size +50M', 'ใหญ่กว่า 50 MB (`-size -1k` = เล็กกว่า 1 KB, หน่วย k M G)'],
          ['-maxdepth 1', 'ไม่ลงลึกเกิน 1 ชั้น'],
          ['-empty', 'ไฟล์/โฟลเดอร์ว่าง'],
          ['-print', 'พิมพ์ path ที่เจอ (ทำอยู่แล้วถ้าไม่สั่งอย่างอื่น)'],
          ['-delete', 'ลบทุกอันที่เจอ! อันตราย ดูข้างล่าง'],
        ] },
        { p: 'ใส่หลายเงื่อนไขได้ ต้องตรงทุกข้อ:' },
        { code: 'find . -type f -size +50M', note: 'ไฟล์ (ไม่เอาโฟลเดอร์) ที่ใหญ่กว่า 50 MB' },
      ]],
      ['ดูก่อนลบ', [
        { p: 'ก่อนใช้ `-delete` ให้รันคำสั่งเดียวกันด้วย `-print` ก่อนเสมอ อ่านรายชื่อให้ครบว่าไม่มีของสำคัญ แล้วค่อยเปลี่ยนคำสุดท้ายเป็น `-delete`' },
        { code: 'find . -name "*.tmp" -print', note: 'ดูก่อน' },
        { code: 'find . -name "*.tmp" -delete', note: 'ค่อยลบ (สำเร็จจะเงียบ)' },
        { warn: '`-delete` ไม่มีถังขยะ และไม่ถามยืนยัน' },
      ]],
      ['error ที่เจอบ่อย', [
        { code: 'find song.mp3', out: "find: 'song.mp3': No such file or directory", note: 'find เข้าใจว่า song.mp3 คือที่เริ่มค้น → `find . -name song.mp3`' },
        { code: 'find . -name *.mp3', out: "find: paths must precede expression: `b.mp3'\nfind: possible unquoted pattern after predicate `-name'?", note: 'ถ้าในโฟลเดอร์ที่ยืนอยู่มี a.mp3 กับ b.mp3 shell จะขยาย *.mp3 เป็น `a.mp3 b.mp3` ก่อนส่งให้ find ซึ่งงง ถ้ามีไฟล์เดียวหรือไม่มีเลยจะไม่ error แต่ได้ผลผิด ครอบ "..." เสมอ → `-name "*.mp3"`' },
        { code: 'find / -name x', out: "find: '/etc/ssl/private': Permission denied\nfind: '/root': Permission denied\nfind: '/var/lib/private': Permission denied", note: 'ไม่ใช่ความผิด แค่เข้าบางห้องไม่ได้ ถ้าเจอผลก็จะอยู่ปนมาด้วย ดู [[devnull|2>/dev/null]]' },
      ]],
    ],
  },
  {
    id: 'sudo', title: 'sudo', at: '1-8', short: 'ทำในนามผู้ดูแลระบบ (root)', abbr: 'superuser do',
    gui: 'คลิกขวา → Run as administrator แล้วกด Yes ที่หน้าต่างถาม',
    intro: 'ของบางอย่างในเครื่องเป็นของ root (ผู้ดูแลระบบ) นักเรียนธรรมดาอ่าน/แก้ไม่ได้ ใส่ `sudo` หน้าคำสั่งเพื่อทำคำสั่งนั้นในนาม root',
    sections: [
      ['รูปแบบคำสั่ง', [
        { code: 'sudo cat secret.txt', out: '[sudo] password for student: ', note: 'เครื่องถามรหัสผ่าน (รหัสที่พี่รูทให้ไว้)' },
        { p: 'ตอนพิมพ์รหัสจะไม่มีอะไรขึ้นจอเลย แม้แต่ `***` เป็นเรื่องปกติ พิมพ์ให้ครบแล้วกด Enter' },
        { p: 'ใส่รหัสถูกแล้ว ในด่านเดียวกันจะไม่ถามซ้ำ' },
      ]],
      ['เมื่อไหร่ถึงควรใช้', [
        { p: 'ใช้เมื่อเจอ `Permission denied` หรือ `authentication required` เท่านั้น อย่าใส่ sudo ทุกคำสั่งไว้ก่อน' },
      ]],
      ['error ที่เจอบ่อย', [
        { code: 'sudo cat secret.txt', out: 'Sorry, try again.', note: 'รหัสผิด ได้ลอง 3 ครั้ง' },
        { out: 'sudo: 3 incorrect password attempts', note: 'ผิด 3 ครั้ง ต้องสั่งใหม่' },
        { code: 'sudo cd /root', out: 'sudo: cd: command not found', note: 'cd ใช้กับ sudo ไม่ได้ (cd อยู่ในตัว bash)' },
      ]],
      ['ข้อควรระวัง', [
        { warn: 'root ทำได้ทุกอย่าง รวมถึงลบของสำคัญของระบบ พลังมากต้องรับผิดชอบมาก อ่านคำสั่งให้ดีก่อน Enter' },
      ]],
    ],
  },
  {
    id: 'rm', title: 'rm', at: '1-9', short: 'ลบไฟล์/โฟลเดอร์ (ถาวร)', abbr: 'remove',
    gui: 'Shift+Delete (ลบถาวร ไม่ผ่านถังขยะ)',
    intro: '`rm` ลบจริง ไม่มีถังขยะ ไม่มี Ctrl+Z ลบแล้วหายเลย จึงต้องอ่านชื่อให้ดีก่อนกด Enter',
    sections: [
      ['รูปแบบคำสั่ง', [
        { code: 'rm old.txt', note: 'ลบไฟล์เดียว (สำเร็จจะเงียบ)' },
        { code: 'rm a.txt b.txt c.txt', note: 'ลบหลายไฟล์' },
        { code: 'rm -r old_music', note: 'ลบทั้งโฟลเดอร์และทุกอย่างข้างใน' },
      ]],
      ['ตัวเลือก', [
        { head: ['ตัวเลือก', 'ทำอะไร'], rows: [
          ['-r', 'recursive ลบทั้งโฟลเดอร์'],
          ['-i', 'interactive ถามยืนยันทีละไฟล์ ตอบ y = ลบ, n = ไม่ลบ (ปลอดภัยที่สุด)'],
          ['-f', 'force ไม่ถาม ไม่บ่นถ้าไม่มีไฟล์ (อันตราย)'],
        ] },
        { code: 'rm -i a.txt', out: "rm: remove regular file 'a.txt'? ", note: 'พิมพ์ y แล้ว Enter' },
      ]],
      ['error ที่เจอบ่อย', [
        { code: 'rm olld.txt', out: "rm: cannot remove 'olld.txt': No such file or directory", note: 'ชื่อผิด' },
        { code: 'rm old_music', out: "rm: cannot remove 'old_music': Is a directory", note: 'เป็นโฟลเดอร์ ต้องใส่ -r' },
        { code: 'rm system.cfg', out: "rm: cannot remove 'system.cfg': Permission denied", note: 'ของ root → [[sudo]] (คิดให้ดีก่อน)' },
      ]],
      ['ข้อควรระวัง', [
        { warn: 'ห้ามพิมพ์ `rm -rf /` บนเครื่องจริงเด็ดขาด คือการสั่งลบทั้งเครื่อง rm มีเบรกกันไว้ให้:' },
        { out: "rm: it is dangerous to operate recursively on '/'\nrm: use --no-preserve-root to override this failsafe" },
        { p: 'ลบหลายไฟล์ตามเงื่อนไข ให้ดูรายชื่อก่อนเสมอ ([[find]] -print, หรือ `ls`)' },
      ]],
    ],
  },
  {
    id: 'poweroff', title: 'poweroff', at: '1-9', short: 'ปิดเครื่อง',
    gui: 'Start → Power → Shut down',
    intro: '`poweroff` ปิดเครื่องทันที เป็นเรื่องของผู้ดูแล จึงต้องใช้กับ [[sudo]]',
    sections: [
      ['รูปแบบคำสั่ง', [
        { code: 'sudo poweroff', note: 'ถามรหัส แล้วปิดเครื่อง' },
      ]],
      ['error ที่เจอบ่อย', [
        { code: 'poweroff', out: 'Failed to power off system via logind: Interactive authentication required.', note: 'ต้องยืนยันว่าเป็นผู้ดูแล → ใส่ sudo' },
      ]],
    ],
  },
  {
    id: 'pwd', title: 'pwd', at: '2-2', short: 'บอกว่าตอนนี้อยู่ที่ไหน', abbr: 'print working directory',
    gui: 'แถบที่อยู่ด้านบนของ File Explorer',
    intro: '`pwd` พิมพ์ที่อยู่เต็มของโฟลเดอร์ที่เรายืนอยู่',
    sections: [
      ['รูปแบบคำสั่ง', [
        { code: 'pwd', out: '/home/student/music/rock', note: 'อ่านจากซ้าย: ราก → home → student → music → rock' },
      ]],
      ['ดูเพิ่ม', [{ p: '[[path|path และที่อยู่]] · prompt ก็บอกที่อยู่ย่อๆ อยู่แล้ว เช่น `~/music/rock`' }]],
    ],
  },
  {
    id: 'path', title: 'path และที่อยู่', at: '2-2', short: '/ ~ . .. ที่อยู่เต็มกับที่อยู่แบบเทียบ',
    gui: 'ที่อยู่แบบ C:\\Users\\student\\Music แต่ใช้ / แทน \\',
    intro: 'path คือ "เส้นทาง" ไปหาไฟล์หรือโฟลเดอร์ เขียนชื่อโฟลเดอร์ต่อกันทีละชั้นคั่นด้วย `/` เช่น `music/rock/song.mp3` = โฟลเดอร์ music → rock → ไฟล์ song.mp3',
    sections: [
      ['สัญลักษณ์พิเศษ', [
        { head: ['เขียน', 'หมายถึง'], rows: [
          ['/', 'อยู่หน้าสุด = "ราก" จุดเริ่มของทั้งเครื่อง / อยู่ตรงกลาง = "เข้าไปใน"'],
          ['~', 'บ้านของเรา = /home/student'],
          ['.', 'ที่ที่ยืนอยู่ตอนนี้'],
          ['..', 'โฟลเดอร์ที่ใหญ่กว่าหนึ่งชั้น (แม่)'],
        ] },
      ]],
      ['ที่อยู่เต็ม กับ ที่อยู่แบบเทียบ', [
        { rows: [['ขึ้นต้นด้วย / (หรือ ~)', 'ที่อยู่เต็ม (absolute) นับจากราก ใช้ได้จากทุกที่ เช่น `/home/student/music`'], ['ไม่ขึ้นต้นด้วย /', 'ที่อยู่แบบเทียบ (relative) นับจากที่ที่ยืนอยู่ตอนนี้ เช่น `music/rock` หรือ `../photos`']] },
        { p: 'สมมติยืนอยู่ที่ `/home/student/music` สามแบบนี้พาไปที่เดียวกัน:' },
        { code: 'cd ../photos', note: 'ถอยหนึ่งชั้นแล้วเข้า photos' },
        { code: 'cd ~/photos', note: 'จากบ้าน' },
        { code: 'cd /home/student/photos', note: 'ที่อยู่เต็ม' },
      ]],
      ['ข้อควรระวัง', [
        { p: 'path แบบเทียบขึ้นกับว่ายืนอยู่ไหน ถ้าพิมพ์ถูกแต่บอกว่าไม่มี ให้ดู prompt ว่าอยู่ผิดชั้นหรือเปล่า' },
        { p: '`~` ที่อยู่ในเครื่องหมายคำพูด "..." จะไม่ถูกแปลงเป็นบ้าน ดู [[quotes]]' },
      ]],
    ],
  },
  {
    id: 'wildcard', title: 'ดอกจัน * (wildcard)', at: '1-7', short: 'แทนชื่อ "อะไรก็ได้"',
    gui: 'พิมพ์คำในช่องค้นหาของ File Explorer',
    intro: '`*` แทนตัวอักษรอะไรก็ได้ กี่ตัวก็ได้ (รวมถึงไม่มีเลย) ใช้เลือกหลายไฟล์ที่ชื่อคล้ายกัน',
    sections: [
      ['ตัวอย่าง', [
        { head: ['แบบ', 'ตรงกับ'], rows: [
          ['*.mp3', 'ทุกชื่อที่ลงท้ายด้วย .mp3'],
          ['photo*', 'ทุกชื่อที่ขึ้นต้นด้วย photo'],
          ['*game*', 'ทุกชื่อที่มีคำว่า game อยู่ตรงไหนก็ได้'],
          ['?', 'ตัวอักษรเดียวอะไรก็ได้ เช่น `song?.mp3` = song1.mp3, songA.mp3'],
        ] },
        { code: 'ls *.txt', note: 'shell ขยาย *.txt เป็นทุกชื่อ .txt ในที่นี่ก่อน แล้วค่อยส่งให้ ls' },
        { code: 'rm *.tmp', note: 'ลบทุก .tmp ในที่นี่ (ดูด้วย `ls *.tmp` ก่อน!)' },
      ]],
      ['กับ find ต้องครอบ "..."', [
        { p: 'ถ้าไม่ครอบ shell จะขยาย `*` เองก่อน (เฉพาะไฟล์ในที่ที่ยืนอยู่) find ก็จะได้ชื่อไม่ครบหรือ error ครอบ "..." เพื่อส่ง `*` ไปให้ find ใช้ค้นทุกชั้นเอง' },
        { code: 'find . -name "*game*"' },
      ]],
    ],
  },
  {
    id: 'options', title: 'ตัวเลือกและ --help', at: '2-6', short: 'ตัวหน้าขีด และการเปิดคู่มือ',
    gui: 'ติ๊กช่อง/ตั้งค่าในหน้าต่าง Options และกด F1 เปิด Help',
    intro: 'อะไรที่ขึ้นต้นด้วย `-` คือ "ตัวเลือก" (option) เปลี่ยนวิธีทำงานของคำสั่ง เช่น `ls -a` `cp -r`',
    sections: [
      ['รูปแบบ', [
        { rows: [['-a', 'ขีดเดียว ตามด้วยตัวอักษรเดียว'], ['-la', 'หลายตัวรวมกันได้ = -l -a'], ['--all', 'ขีดสอง ตามด้วยคำเต็ม (ชื่อยาว)']] },
      ]],
      ['เปิดคู่มือ', [
        { code: 'ls --help', note: 'ดูว่าคำสั่งนี้มีตัวเลือกอะไรบ้าง ทุกคำสั่งมี' },
        { code: 'man find', note: 'คู่มือฉบับเต็ม (manual)' },
        { p: 'คนเก่งไม่ได้จำทุกตัวเลือก แต่รู้ว่าต้องไปหาในคู่มือ (หรือใน Piki)' },
      ]],
      ['error ที่เจอบ่อย', [
        { code: 'ls -z', out: "ls: invalid option -- 'z'\nTry 'ls --help' for more information.", note: 'ไม่มีตัวเลือกนี้' },
        { code: 'ls --hlep', out: "ls: unrecognized option '--hlep'\nTry 'ls --help' for more information.", note: 'สะกดชื่อยาวผิด' },
      ]],
    ],
  },
  {
    id: 'quotes', title: 'ช่องว่างและเครื่องหมายคำพูด', at: '4-2', short: 'ชื่อที่มีช่องว่าง "..."',
    gui: 'ใน Windows ตั้งชื่อมีช่องว่างได้ปกติ แต่ในบรรทัดคำสั่ง ช่องว่างคือตัวแบ่งคำ',
    intro: 'shell ใช้ช่องว่างแบ่งคำสั่งออกเป็นชิ้นๆ ชื่อ `my notes.txt` จึงกลายเป็นสองชื่อ `my` กับ `notes.txt` ต้องบอกว่าเป็นชื่อเดียวกัน',
    sections: [
      ['วิธีเขียน', [
        { code: 'cat "my notes.txt"', note: 'ครอบทั้งชื่อด้วย "..." (นิยมที่สุด)' },
        { code: "cat 'my notes.txt'", note: "ใช้ '...' ก็ได้" },
        { code: 'cat my\\ notes.txt', note: 'ใส่ \\ หน้าช่องว่างก็ได้' },
      ]],
      ['ข้อควรระวัง', [
        { p: 'เปิดเครื่องหมายแล้วต้องปิดให้ครบคู่ ไม่อย่างนั้นจะเจอ `unexpected EOF while looking for matching`' },
        { p: '`~` ที่อยู่ข้างใน "..." จะไม่กลายเป็นบ้าน เขียน `~/"my notes.txt"` แทน `"~/my notes.txt"`' },
      ]],
    ],
  },
  {
    id: 'exit-code', title: 'exit code', at: '4-1', short: 'ตัวเลขบอกผลของคำสั่ง [exit n]',
    gui: 'ไม่มีให้เห็นใน Windows ปกติ เหมือนไฟสถานะเขียว/แดงของโปรแกรม',
    intro: 'ทุกคำสั่งจบด้วยตัวเลขหนึ่งตัวบอกว่าสำเร็จไหม ตั้งแต่เฟส 4 เกมแสดงเป็น `[exit n]` หลังทุกคำสั่ง',
    sections: [
      ['ตัวเลขที่เจอบ่อย', [
        { head: ['ตัวเลข', 'ความหมาย'], rows: [
          ['0', 'สำเร็จ'],
          ['1', 'มีปัญหาทั่วไป (ไม่มีไฟล์ ไม่มีสิทธิ์ ฯลฯ)'],
          ['2', 'ใช้คำสั่งผิดวิธี หรือปัญหาร้ายแรงกว่า (เช่น ls หาไม่เจอ)'],
          ['123', 'xargs: มีคำสั่งที่มันสั่งไปแล้วพังอย่างน้อยหนึ่งตัว'],
          ['126', 'เจอไฟล์ แต่รันไม่ได้ (ไม่ใช่ไฟล์ที่รันได้ หรือไม่มีสิทธิ์)'],
          ['127', 'ไม่มีคำสั่งนี้ (command not found)'],
        ] },
        { p: 'อะไรที่ไม่ใช่ 0 = ไม่สำเร็จ ให้อ่าน error บรรทัดข้างบน ดู [[read-error|การอ่าน error]]' },
      ]],
    ],
  },
  {
    id: 'pipe', title: 'ท่อ | (pipe)', at: 'B1', short: 'ส่งผลลัพธ์ต่อให้อีกคำสั่ง',
    gui: 'สายพานในโรงงาน: เครื่องแรกทำเสร็จ ส่งของต่อให้เครื่องถัดไป (ไม่มีใน GUI ปกติ)',
    intro: '`|` (Shift + \\) เอาสิ่งที่คำสั่งซ้ายพิมพ์ออกมา ไม่แสดงบนจอ แต่ส่งเป็น "ของกิน" ให้คำสั่งขวาทำต่อ ต่อได้หลายท่อ',
    sections: [
      ['ตัวอย่าง', [
        { code: 'ls | wc -l', out: '42', note: 'ls ส่งรายชื่อให้ wc นับบรรทัด = มีกี่ชื่อ ดู [[wc]]' },
        { code: 'ls | grep song', out: 'song1.mp3\nsong2.mp3', note: 'กรองเอาเฉพาะชื่อที่มี song ดู [[grep]]' },
        { code: 'ls | grep song | wc -l', out: '2', note: 'สองท่อ: กรอง แล้วนับ' },
        { code: 'cat list.txt | grep game' },
      ]],
      ['ข้อควรจำ', [
        { p: 'สิ่งที่ไหลผ่านท่อคือผลลัพธ์ปกติ (stdout) เท่านั้น ข้อความ error ไม่ไหลตาม มันยังขึ้นจอเหมือนเดิม ดู [[devnull|2>/dev/null]]' },
        { p: 'ทั้งสองฝั่งของ `|` ต้องมีคำสั่ง ถ้าขาดฝั่งใด bash จะบ่นว่า `syntax error near unexpected token `|\'`' },
      ]],
    ],
  },
  {
    id: 'wc', title: 'wc', at: 'B1', short: 'นับบรรทัด/คำ/ตัวอักษร', abbr: 'word count',
    gui: 'ตัวนับคำของ Word (Word Count)',
    intro: '`wc` นับของที่ได้รับ ใช้บ่อยสุดคือ `wc -l` นับจำนวนบรรทัด (ซึ่งมักเท่ากับจำนวนรายการ)',
    sections: [
      ['ตัวเลือก', [
        { rows: [['-l', 'นับบรรทัด'], ['-w', 'นับคำ'], ['-c', 'นับไบต์']] },
        { code: 'wc -l list.txt', out: '5 list.txt' },
        { code: 'ls | wc -l', out: '5', note: 'รับทางท่อ จะได้แค่ตัวเลข' },
      ]],
    ],
  },
  {
    id: 'grep', title: 'grep', at: 'B2', short: 'กรองเอาบรรทัดที่มีคำที่ต้องการ',
    gui: 'Ctrl+F หาคำในไฟล์ แต่ grep แสดงทุกบรรทัดที่เจอพร้อมกัน',
    intro: '`grep คำ` แสดงเฉพาะบรรทัดที่มีคำนั้น ใช้กับไฟล์ หรือรับของทางท่อ',
    sections: [
      ['รูปแบบคำสั่ง', [
        { code: 'grep ERROR log.txt', note: 'บรรทัดใน log.txt ที่มีคำว่า ERROR' },
        { code: 'ls | grep mp3', note: 'รายชื่อไฟล์เฉพาะที่มี mp3' },
      ]],
      ['ตัวเลือก', [
        { head: ['ตัวเลือก', 'ทำอะไร'], rows: [['-i', 'ไม่สนตัวใหญ่ตัวเล็ก'], ['-v', 'กลับด้าน: เอาบรรทัดที่ไม่มีคำนั้น'], ['-c', 'นับจำนวนบรรทัดที่เจอ (แทน `| wc -l`)'], ['-n', 'บอกเลขบรรทัดด้วย']] },
      ]],
      ['error ที่เจอบ่อย', [
        { code: 'grep', out: "Usage: grep [OPTION]... PATTERNS [FILE]...\nTry 'grep --help' for more information.", note: 'ไม่ได้บอกว่าจะหาคำอะไร' },
      ]],
    ],
  },
  {
    id: 'devnull', title: '2>/dev/null', at: 'B3', short: 'ทิ้งข้อความ error ไม่ให้ขึ้นจอ',
    gui: 'โยนคำบ่นลงถังขยะ',
    intro: 'คำสั่งส่งข้อความออกมาได้สองทาง: ผลลัพธ์ปกติ (stdout เบอร์ 1) กับคำบ่น/error (stderr เบอร์ 2) ปกติทั้งสองขึ้นจอปนกัน `2>` คือ "ส่งทางเบอร์ 2 ไปที่..." และ `/dev/null` คือหลุมดำ อะไรเข้าไปหายหมด',
    sections: [
      ['ตัวอย่าง', [
        { code: 'find / -name "game*"', out: "find: '/etc/ssl/private': Permission denied\n/home/student/game.txt\nfind: '/root': Permission denied\nfind: '/var/lib/private': Permission denied", note: 'ผลที่ต้องการจมอยู่ในคำบ่น' },
        { code: 'find / -name "game*" 2>/dev/null', out: '/home/student/game.txt', note: 'คำบ่นหายไป เหลือแต่ผลลัพธ์' },
      ]],
      ['ข้อควรจำ', [
        { p: 'เขียนติดกัน `2>` ไม่มีช่องว่างระหว่าง 2 กับ >' },
        { p: 'ทิ้งแค่คำบ่น ไม่ได้แก้ปัญหา ใช้เมื่อรู้แล้วว่าคำบ่นพวกนั้นไม่สำคัญ (เช่น Permission denied ตอนค้นทั้งเครื่อง)' },
        { p: '`2>&1` = เอา error ไปรวมทางเดียวกับผลลัพธ์' },
      ]],
    ],
  },
  {
    id: 'redirect', title: '> และ >> (เก็บลงไฟล์)', at: 'B4', short: 'ส่งผลลัพธ์ลงไฟล์แทนจอ',
    gui: 'Save As… ผลลัพธ์ลงไฟล์',
    intro: '`>` เอาผลลัพธ์ของคำสั่ง (stdout) ไปเขียนลงไฟล์แทนการขึ้นจอ ไฟล์ยังไม่มีจะสร้างให้',
    sections: [
      ['ตัวอย่าง', [
        { code: 'ls music > songs.txt', note: 'ไม่มีอะไรขึ้นจอ เพราะไหลลงไฟล์หมด' },
        { code: 'cat songs.txt', out: 'song1.mp3\nsong2.mp3', note: 'เปิดดูสิ่งที่เก็บไว้' },
        { code: 'ls photos >> songs.txt', note: '>> = เขียนต่อท้าย ของเดิมยังอยู่' },
      ]],
      ['ข้อควรระวัง', [
        { warn: '`>` เขียนทับทั้งไฟล์ ของเดิมหายหมด ถ้าอยากเก็บของเดิมไว้ใช้ `>>`' },
        { p: 'error ไม่ลงไฟล์ (ยังขึ้นจอ) เพราะ `>` ย้ายแค่ผลลัพธ์ปกติ ดู [[devnull|2>/dev/null]]' },
      ]],
    ],
  },
  {
    id: 'xargs', title: 'xargs', at: 'B5', short: 'เอารายชื่อที่ได้รับมาเป็นส่วนท้ายของคำสั่ง',
    gui: 'เลือกทุกไฟล์ตามรายชื่อ แล้วสั่งทีเดียว (เช่น กด Delete)',
    intro: 'บางคำสั่ง (เช่น `rm`) ไม่รับของทางท่อ มันอยากได้ชื่อไฟล์ต่อท้าย `xargs` รับรายชื่อจากท่อ แล้วเอาไปต่อท้ายคำสั่งให้',
    sections: [
      ['ตัวอย่าง', [
        { code: 'cat trash_list.txt | xargs rm', note: 'ถ้าในไฟล์มี a.tmp กับ b.tmp จะเท่ากับสั่ง `rm a.tmp b.tmp`' },
        { code: 'find . -name "*.tmp" | xargs rm', note: 'ลบทุกไฟล์ที่ find เจอ (ดูรายชื่อก่อนลบนะ)' },
      ]],
      ['ข้อควรระวัง', [
        { warn: 'xargs แบ่งชื่อด้วยช่องว่าง ไฟล์ชื่อ `my file.txt` จะกลายเป็น `my` กับ `file.txt` แล้วลบผิดไฟล์ได้ ถ้าชื่อมีช่องว่างใช้ `find ... -delete` แทน' },
        { p: 'exit code 123 = มีคำสั่งที่ xargs สั่งไปแล้วพังอย่างน้อยหนึ่งตัว อ่าน error ข้างบน' },
      ]],
    ],
  },
  {
    id: 'run-script', title: './ รันไฟล์', at: 'R4', short: 'รันโปรแกรม/สคริปต์ที่อยู่ในโฟลเดอร์',
    gui: 'ดับเบิลคลิกไฟล์ .exe เพื่อเปิดโปรแกรม',
    intro: 'พิมพ์ชื่อไฟล์เฉยๆ bash จะไปหาเฉพาะในที่เก็บคำสั่งของระบบ ไม่หาในโฟลเดอร์ที่เรายืนอยู่ ต้องบอกให้ชัดว่า "ไฟล์นี้ ที่อยู่ตรงนี้" ด้วย `./`',
    sections: [
      ['ตัวอย่าง', [
        { code: './hello.sh', note: '. = ที่นี่, / = เข้าไปใน → รันไฟล์ hello.sh ในโฟลเดอร์นี้' },
        { code: 'games/start.sh', note: 'รันไฟล์ในโฟลเดอร์อื่นด้วย path ก็ได้' },
        { p: 'ไฟล์ที่รันได้จะเป็นสีเขียวใน [[ls]]' },
      ]],
      ['error ที่เจอบ่อย', [
        { code: 'hello.sh', out: 'bash: hello.sh: command not found', note: 'ลืม ./ bash เลยไปหาในที่เก็บคำสั่ง' },
        { code: './notes.txt', out: 'bash: ./notes.txt: Permission denied', note: 'ไฟล์นี้ไม่ใช่ไฟล์ที่รันได้ (exit 126)' },
        { code: './nothing.sh', out: 'bash: ./nothing.sh: No such file or directory', note: 'ไม่มีไฟล์นี้ในที่ที่ยืนอยู่ (exit 127)' },
      ]],
    ],
  },
];

const byId = Object.fromEntries(PAGES.map(p => [p.id, p]));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// `code` and [[links]]
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[\[([\w-]+)(?:\|([^\]]+))?\]\]/g, (_, id, label) => `<a href="#" data-page="${id}">${label || byId[id]?.title || id}</a>`);
}

// Lines that are complaints (shown red like in the terminal) rather than normal output.
const ERR = /^(bash|ls|cd|cat|mkdir|cp|mv|rm|find|grep|wc|xargs|sudo): |^(Sorry|Failed|Usage|Try) /;

function block(b) {
  if (b.p) return `<p>${inline(b.p)}</p>`;
  if (b.warn) return `<div class="pk-warn">⚠️ ${inline(b.warn)}</div>`;
  if (b.rows) return `<table class="pk-table">${b.head ? `<tr>${b.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr>` : ''}` +
    b.rows.map(r => `<tr><td>${r[0].startsWith('-') || /^[\w.*?~/|>]/.test(r[0]) && r[0].length < 24 ? `<code>${esc(r[0])}</code>` : esc(r[0])}</td><td>${inline(r[1])}</td></tr>`).join('') + '</table>';
  return `<div class="pk-ex">${b.code != null ? `<div class="pk-cmd"><span>$</span> ${esc(b.code)}</div>` : ''}` +
    (b.out ? `<pre class="pk-out">${b.out.split('\n').map(l => ERR.test(l) ? `<span class="pk-err">${esc(l)}</span>` : esc(l)).join('\n')}</pre>` : '') + (b.note ? `<div class="pk-note">${inline(b.note)}</div>` : '') + '</div>';
}

// The whole Piki "site" in `root`. unlocked(page) says whether the player may read it; onView(page) is told each view.
export function mountPiki(root, { unlocked, lockedText, onView }) {
  let cur = null;
  root.innerHTML = `<div class="pk">
    <div class="pk-top"><div class="pk-logo"><b>Piki</b><small>สารานุกรมเสรีของเครื่องป้าเซิร์ฟ</small></div>
      <input class="pk-search" placeholder="ค้นหาใน Piki" spellcheck="false"></div>
    <div class="pk-body"><nav class="pk-nav"></nav><article class="pk-page"></article></div></div>`;
  const nav = root.querySelector('.pk-nav'), page = root.querySelector('.pk-page'), search = root.querySelector('.pk-search');

  function list() {
    const q = search.value.trim().toLowerCase();
    nav.innerHTML = '<div class="pk-navh">หน้าทั้งหมด</div>' + PAGES.filter(p => !q || (p.title + ' ' + p.short + ' ' + p.id).toLowerCase().includes(q))
      .map(p => unlocked(p)
        ? `<a href="#" data-page="${p.id}" class="${cur === p.id ? 'on' : ''}">${esc(p.title)}</a>`
        : `<span class="pk-locked" title="${esc(lockedText(p))}">🔒 ${esc(p.title)}</span>`).join('');
  }

  function show(id) {
    const p = byId[id];
    if (!p) return;
    cur = id;
    if (!unlocked(p)) {
      page.innerHTML = `<h1>${esc(p.title)}</h1><p class="pk-lockmsg">🔒 หน้านี้ยังไม่ปลดล็อก ${esc(lockedText(p))}</p>`;
    } else {
      page.innerHTML = `<h1>${esc(p.title)}</h1><div class="pk-from">จาก Piki สารานุกรมเสรีของเครื่องป้าเซิร์ฟ</div>
        <table class="pk-info"><tr><th colspan="2">${esc(p.title)}</th></tr>
          ${p.abbr ? `<tr><td>ย่อมาจาก</td><td>${esc(p.abbr)}</td></tr>` : ''}
          <tr><td>ใช้ทำ</td><td>${esc(p.short)}</td></tr>
          <tr><td>เทียบกับ Windows</td><td>${esc(p.gui)}</td></tr></table>
        <p class="pk-lead">${inline(p.intro)}</p>
        <div class="pk-toc"><b>เนื้อหา</b>${p.sections.map(([h], i) => `<a href="#" data-sec="${i}">${i + 1} ${esc(h)}</a>`).join('')}</div>
        ${p.sections.map(([h, blocks], i) => `<h2 id="pk-s${i}">${esc(h)}</h2>${blocks.map(block).join('')}`).join('')}`;
      onView?.(p);
    }
    page.scrollTop = 0;
    list();
  }

  root.addEventListener('click', e => {
    const a = e.target.closest('[data-page],[data-sec]');
    if (!a) return;
    e.preventDefault();
    if (a.dataset.page) show(a.dataset.page);
    else page.querySelector('#pk-s' + a.dataset.sec)?.scrollIntoView({ block: 'start' });
  });
  search.addEventListener('input', () => {
    list();
    const q = search.value.trim().toLowerCase();
    if (!q) return;
    const hit = PAGES.find(p => unlocked(p) && (p.id === q || p.title.toLowerCase() === q)) ||
      PAGES.find(p => unlocked(p) && (p.title + ' ' + p.short).toLowerCase().includes(q));
    if (hit) show(hit.id);
  });
  return {
    show: id => show(byId[id] ? id : cur || 'read-error'),
    refresh: list,
  };
}

// "piki rm" / "piki 2>/dev/null" -> page id
export function findPage(word) {
  const w = (word || '').trim().toLowerCase();
  if (!w) return null;
  return (PAGES.find(p => p.id === w || p.title.toLowerCase() === w) ||
    PAGES.find(p => p.title.toLowerCase().includes(w) || p.short.toLowerCase().includes(w)))?.id || null;
}
