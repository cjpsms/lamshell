// Game-edition manual pages: real usage line + Thai summary. Used by `man X` and `X --help`.
export const MAN = {
  ls: `Usage: ls [OPTION]... [FILE]...
List information about the FILEs (the current directory by default).

  ls            ดูว่ามีไฟล์/โฟลเดอร์อะไรบ้าง (list)
  -a, --all     รวมไฟล์ซ่อน (ชื่อขึ้นต้นด้วยจุด) ด้วย
  -l            แบบยาว: สิทธิ์ เจ้าของ ขนาด วันที่
  -h            (ใช้คู่กับ -l) ขนาดแบบอ่านง่าย เช่น 50M
      --help    แสดงหน้านี้`,
  cd: `cd: cd [dir]
    เปลี่ยนโฟลเดอร์ที่อยู่ (change directory)

    cd ชื่อโฟลเดอร์   เข้าไปในโฟลเดอร์
    cd ..            ถอยออกไปหนึ่งชั้น
    cd ~  หรือ  cd   กลับบ้าน (/home/student)`,
  pwd: `pwd: pwd
    บอกว่าตอนนี้อยู่โฟลเดอร์ไหน (print working directory)`,
  mkdir: `Usage: mkdir [OPTION]... DIRECTORY...
Create the DIRECTORY(ies), if they do not already exist.

  mkdir ชื่อ      สร้างโฟลเดอร์ใหม่ (make directory)
  -p, --parents  สร้างซ้อนทุกชั้นในทีเดียว และไม่บ่นถ้ามีอยู่แล้ว`,
  cp: `Usage: cp [OPTION]... SOURCE DEST
  or:  cp [OPTION]... SOURCE... DIRECTORY
Copy SOURCE to DEST, or multiple SOURCE(s) to DIRECTORY.

  cp ต้นทาง ปลายทาง   ก๊อปไฟล์ (copy) — ต้องบอกทั้งสองอย่าง
  -r, -R, --recursive  ก๊อปทั้งโฟลเดอร์
  -i                   ถามก่อนเขียนทับ`,
  mv: `Usage: mv [OPTION]... SOURCE DEST
  or:  mv [OPTION]... SOURCE... DIRECTORY
Rename SOURCE to DEST, or move SOURCE(s) to DIRECTORY.

  mv ชื่อเก่า ชื่อใหม่     เปลี่ยนชื่อ
  mv ไฟล์ โฟลเดอร์/      ย้ายไปไว้ในโฟลเดอร์ (move)`,
  rm: `Usage: rm [OPTION]... [FILE]...
Remove (unlink) the FILE(s).

  rm ไฟล์              ลบไฟล์ (remove) — ไม่มีถังขยะ ลบแล้วหายเลย
  -r, -R, --recursive  ลบทั้งโฟลเดอร์และของข้างใน
  -i                   ถามก่อนลบทุกไฟล์
  -f, --force          ไม่ถาม ไม่บ่น (อันตราย)`,
  cat: `Usage: cat [OPTION]... [FILE]...
Concatenate FILE(s) to standard output.

  cat ไฟล์    แสดงเนื้อหาไฟล์ออกมาบนจอ`,
  find: `Usage: find [path...] [expression]

  find ที่ไหน เงื่อนไข        ค้นหาไฟล์
  -name "แบบ"     ชื่อตรงกับแบบ (* = อะไรก็ได้)   เช่น -name "*grade*"
  -iname "แบบ"    เหมือน -name แต่ไม่สนตัวเล็กตัวใหญ่
  -type f / d     เฉพาะไฟล์ (f) หรือโฟลเดอร์ (d)
  -size +50M      ใหญ่เกิน 50MB  (-size -1k = เล็กกว่า 1KB)
  -maxdepth N     ลงลึกไม่เกิน N ชั้น
  -print          แสดงชื่อที่เจอ (ค่าเริ่มต้น)
  -delete         ลบทุกอย่างที่ตรงเงื่อนไข — ใช้ -print ดูก่อนเสมอ!`,
  sudo: `usage: sudo command
    ทำคำสั่งด้วยสิทธิ์ผู้ดูแล (root) — ต้องใส่รหัสผ่าน
    พลังมากต้องรับผิดชอบมาก: ใช้เฉพาะตอนจำเป็น`,
  poweroff: `Usage: poweroff [OPTIONS...]
    ปิดเครื่อง — ต้องใช้สิทธิ์ผู้ดูแล (sudo poweroff)`,
  grep: `Usage: grep [OPTION]... PATTERNS [FILE]...
Search for PATTERNS in each FILE.

  grep คำ ไฟล์      แสดงเฉพาะบรรทัดที่มีคำนั้น
  -i               ไม่สนตัวเล็กตัวใหญ่
  -v               กลับด้าน: บรรทัดที่ไม่มีคำนั้น
  -c               นับจำนวนบรรทัดที่เจอ
  -n               แสดงเลขบรรทัด`,
  wc: `Usage: wc [OPTION]... [FILE]...
Print newline, word, and byte counts for each FILE.

  wc -l    นับบรรทัด (มักใช้ต่อท้าย | )
  wc -w    นับคำ
  wc -c    นับไบต์`,
  xargs: `Usage: xargs [OPTION]... COMMAND [INITIAL-ARGS]...
Run COMMAND with arguments INITIAL-ARGS and more arguments read from input.

  ... | xargs rm    เอาทุกคำที่ไหลมาในท่อ ไปต่อท้ายคำสั่ง rm
  ระวัง: ชื่อไฟล์ที่มีช่องว่างจะถูกหั่นเป็นหลายชื่อ
  exit 123 = มีคำสั่งที่ xargs สั่งไปแล้วพังอย่างน้อยหนึ่งตัว`,
  echo: `echo: echo [arg ...]
    พิมพ์ข้อความออกมา`,
  man: `man: man คำสั่ง
    เปิดคู่มือของคำสั่ง (ฉบับเกม มีภาษาไทย)`,
};

export const OPERATORS_HELP = `ท่อและถัง:
  a | b          เอาผลของ a ไปเป็นของกินของ b
  a > ไฟล์       เทผลลงไฟล์ (เขียนทับ!)
  a >> ไฟล์      เทผลต่อท้ายไฟล์
  a 2>/dev/null  ทิ้งข้อความบ่น (stderr) ลงหลุมดำ
  a && b         ทำ b ต่อ ถ้า a สำเร็จ`;
