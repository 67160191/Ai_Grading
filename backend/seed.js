/**
 * Seed script — สร้างข้อมูลทดสอบ
 *
 * อาจารย์ 2 คน × 2 วิชา × 2 assignments + rubric with levels
 * นักเรียน 10 คน ลงเรียนทุกวิชา
 *
 * รัน: node seed.js
 * (ต้องอยู่ใน folder backend/ และ server ไม่ต้องรัน)
 */

import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, 'data/app.db');
const SCHEMA_PATH = join(__dirname, 'src/db/schema.sql');

mkdirSync(join(__dirname, 'data'), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// รัน schema
db.exec(readFileSync(SCHEMA_PATH, 'utf-8'));

const hash = (pw) => bcrypt.hashSync(pw, 10);

// ─── Users ────────────────────────────────────────────────────────────────────

const insertUser = db.prepare(
  'INSERT OR IGNORE INTO users (name, email, password, role) VALUES (?, ?, ?, ?)'
);

const teachers = [
  { name: 'อ.สมชาย วิทยากร',   email: 'teacher1@test.com' },
  { name: 'อ.สุมาลี พัฒนา',     email: 'teacher2@test.com' },
];

const students = [
  { name: 'นักเรียน ก — กนกวรรณ',  email: 'student01@test.com' },
  { name: 'นักเรียน ข — ขวัญใจ',   email: 'student02@test.com' },
  { name: 'นักเรียน ค — คมสัน',    email: 'student03@test.com' },
  { name: 'นักเรียน ง — งามพริ้ง', email: 'student04@test.com' },
  { name: 'นักเรียน จ — จิรา',     email: 'student05@test.com' },
  { name: 'นักเรียน ฉ — ฉัตรชัย',  email: 'student06@test.com' },
  { name: 'นักเรียน ช — ชนม์นิภา', email: 'student07@test.com' },
  { name: 'นักเรียน ซ — ซาร่า',    email: 'student08@test.com' },
  { name: 'นักเรียน ญ — ญาดา',    email: 'student09@test.com' },
  { name: 'นักเรียน ฐ — ฐิตินันท์', email: 'student10@test.com' },
];

for (const t of teachers) insertUser.run(t.name, t.email, hash('1234'), 'teacher');
for (const s of students)  insertUser.run(s.name, s.email, hash('1234'), 'student');

const getUser = (email) => db.prepare('SELECT * FROM users WHERE email = ?').get(email);

const t1 = getUser('teacher1@test.com');
const t2 = getUser('teacher2@test.com');
const studentRows = students.map(s => getUser(s.email));

// ─── Courses ──────────────────────────────────────────────────────────────────

const insertCourse = db.prepare(
  'INSERT INTO courses (name, description, teacher_id) VALUES (?, ?, ?)'
);

const courses = [
  // Teacher 1
  { name: 'Web Frontend Development',   desc: 'HTML/CSS/JS/React ตั้งแต่พื้นฐาน',            teacher: t1 },
  { name: 'JavaScript Advanced',        desc: 'Async, Design Patterns, Testing',               teacher: t1 },
  // Teacher 2
  { name: 'UI/UX Design Fundamentals',  desc: 'Figma, Wireframe, Prototype, User Research',    teacher: t2 },
  { name: 'React & State Management',   desc: 'React, Redux Toolkit, TanStack Query',           teacher: t2 },
];

const courseIds = courses.map(c => insertCourse.run(c.name, c.desc, c.teacher.id).lastInsertRowid);

// ─── Enrollments (นักเรียน 10 คน ลงทุกวิชา) ────────────────────────────────

const insertEnroll = db.prepare('INSERT OR IGNORE INTO enrollments (student_id, course_id) VALUES (?, ?)');
for (const student of studentRows) {
  for (const courseId of courseIds) {
    insertEnroll.run(student.id, courseId);
  }
}

// ─── Rubric helper ────────────────────────────────────────────────────────────

function createRubric(courseId, name, desc, criteria) {
  const rubricId = db.prepare(
    'INSERT INTO rubric_templates (course_id, name, description) VALUES (?, ?, ?)'
  ).run(courseId, name, desc).lastInsertRowid;

  const insertCriteria = db.prepare(
    'INSERT INTO rubric_criteria (rubric_id, name, description, max_score, weight, order_index) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertLevel = db.prepare(
    'INSERT INTO rubric_levels (rubric_criteria_id, level, score, description) VALUES (?, ?, ?, ?)'
  );

  criteria.forEach((c, i) => {
    const criteriaId = insertCriteria.run(rubricId, c.name, c.desc, c.max_score, 1.0, i).lastInsertRowid;
    if (c.levels) {
      for (const lv of c.levels) {
        insertLevel.run(criteriaId, lv.level, lv.score, lv.desc);
      }
    }
  });

  return rubricId;
}

// ─── Rubrics ─────────────────────────────────────────────────────────────────

// Course 1 — Web Frontend Development (teacher1)
const rubricHTML = createRubric(courseIds[0], 'ตรวจ HTML Structure', 'เกณฑ์ตรวจ HTML/Semantic/Accessibility', [
  {
    name: 'ความถูกต้องของ HTML Tag', desc: 'tag เปิด-ปิดครบ, ใช้ semantic tag ถูก', max_score: 40,
    levels: [
      { level: 'excellent', score: 40, desc: 'ใช้ semantic tag ครบถ้วน ถูกต้องทุก element' },
      { level: 'good',      score: 30, desc: 'ถูกต้องเป็นส่วนใหญ่ มีข้อผิดพลาดเล็กน้อย' },
      { level: 'fair',      score: 20, desc: 'ใช้ semantic tag บางส่วน มีข้อผิดพลาดหลายจุด' },
      { level: 'poor',      score: 10, desc: 'ไม่ใช้ semantic tag หรือโครงสร้างผิดพลาดมาก' },
    ]
  },
  {
    name: 'Accessibility เบื้องต้น', desc: 'alt ใน img, label เชื่อม input, heading ลำดับถูก', max_score: 30,
    levels: [
      { level: 'excellent', score: 30, desc: 'ครบทุก accessibility requirement' },
      { level: 'good',      score: 22, desc: 'ครบส่วนใหญ่ ขาดเล็กน้อย' },
      { level: 'fair',      score: 15, desc: 'ขาด accessibility หลายจุด' },
      { level: 'poor',      score: 5,  desc: 'แทบไม่มี accessibility' },
    ]
  },
  {
    name: 'ความสะอาดของโค้ด', desc: 'indent สม่ำเสมอ, ไม่มี attribute ซ้ำ', max_score: 30,
    levels: [
      { level: 'excellent', score: 30, desc: 'โค้ดสะอาด indent สม่ำเสมอตลอด' },
      { level: 'good',      score: 22, desc: 'สะอาดเป็นส่วนใหญ่ มีบางจุดไม่สม่ำเสมอ' },
      { level: 'fair',      score: 15, desc: 'indent ไม่สม่ำเสมอ มี attribute ซ้ำ' },
      { level: 'poor',      score: 5,  desc: 'โค้ดยุ่งเหยิง อ่านยาก' },
    ]
  },
]);

const rubricCSS = createRubric(courseIds[0], 'ตรวจ CSS Layout', 'Flexbox/Grid/Responsive', [
  {
    name: 'การใช้ Flexbox / Grid', desc: 'ใช้ flex หรือ grid ได้ถูกต้อง ไม่ใช้ float hack', max_score: 40,
    levels: [
      { level: 'excellent', score: 40, desc: 'ใช้ Flexbox/Grid ได้อย่างเชี่ยวชาญ layout สมบูรณ์' },
      { level: 'good',      score: 30, desc: 'ใช้ได้ถูกต้อง มีบางจุดที่ยังไม่ optimal' },
      { level: 'fair',      score: 20, desc: 'ใช้ได้บางส่วน มีการใช้ hack บ้าง' },
      { level: 'poor',      score: 10, desc: 'ไม่ใช้หรือใช้ผิด ใช้ float/position hack' },
    ]
  },
  {
    name: 'Responsive Design', desc: 'media query ปรับ layout สำหรับมือถือและ desktop', max_score: 35,
    levels: [
      { level: 'excellent', score: 35, desc: 'Responsive ทุก breakpoint ทดสอบได้จริง' },
      { level: 'good',      score: 26, desc: 'มี media query แต่บางขนาดยังไม่สมบูรณ์' },
      { level: 'fair',      score: 17, desc: 'มี media query น้อยมาก ใช้งานไม่ได้จริง' },
      { level: 'poor',      score: 5,  desc: 'ไม่มี responsive' },
    ]
  },
  {
    name: 'ความสม่ำเสมอของ Style', desc: 'ใช้ CSS variable หรือ class ซ้ำได้', max_score: 25,
    levels: [
      { level: 'excellent', score: 25, desc: 'ใช้ CSS variable และ reusable class ครบ' },
      { level: 'good',      score: 18, desc: 'ส่วนใหญ่ดี มีบาง magic number' },
      { level: 'fair',      score: 12, desc: 'มี magic number กระจัดกระจาย' },
      { level: 'poor',      score: 4,  desc: 'ไม่มีการจัดการ style อย่างเป็นระบบ' },
    ]
  },
]);

// Course 2 — JavaScript Advanced (teacher1)
const rubricJS = createRubric(courseIds[1], 'ตรวจ JavaScript Logic', 'Logic/ES6+/Code Quality', [
  {
    name: 'ความถูกต้องของ Logic', desc: 'โปรแกรมทำงานถูกต้อง handle edge case', max_score: 50,
    levels: [
      { level: 'excellent', score: 50, desc: 'ทำงานถูกต้องทุก case รวมถึง edge case' },
      { level: 'good',      score: 38, desc: 'ถูกต้องเป็นส่วนใหญ่ มี edge case ที่พลาด' },
      { level: 'fair',      score: 25, desc: 'ถูกต้องเฉพาะ happy path' },
      { level: 'poor',      score: 10, desc: 'logic ผิดพลาดมาก' },
    ]
  },
  {
    name: 'Modern JavaScript (ES6+)', desc: 'const/let, arrow fn, destructuring, template literal', max_score: 30,
    levels: [
      { level: 'excellent', score: 30, desc: 'ใช้ ES6+ features ครบ อย่างเหมาะสม' },
      { level: 'good',      score: 22, desc: 'ใช้ ES6+ หลายอย่าง บางจุดยังใช้ var หรือ old syntax' },
      { level: 'fair',      score: 15, desc: 'ใช้ ES6+ น้อยมาก' },
      { level: 'poor',      score: 5,  desc: 'ใช้ syntax เก่าทั้งหมด' },
    ]
  },
  {
    name: 'ความสะอาดของโค้ด', desc: 'ตั้งชื่อตัวแปรสื่อความหมาย, แยก function', max_score: 20,
    levels: [
      { level: 'excellent', score: 20, desc: 'โค้ดสะอาด ชื่อสื่อความหมาย แยก function ดี' },
      { level: 'good',      score: 15, desc: 'ดีเป็นส่วนใหญ่ มีบางจุดที่ยังปรับปรุงได้' },
      { level: 'fair',      score: 10, desc: 'ชื่อตัวแปรไม่สื่อ function ยาวเกินไป' },
      { level: 'poor',      score: 3,  desc: 'อ่านยากมาก ไม่มีโครงสร้าง' },
    ]
  },
]);

// Course 3 — UI/UX Design Fundamentals (teacher2)
const rubricUIUX = createRubric(courseIds[2], 'ตรวจ UI/UX Design', 'Usability/Visual/Process', [
  {
    name: 'Usability & User Flow', desc: 'ผู้ใช้เดิน flow ได้ลื่น ไม่สับสน', max_score: 40,
    levels: [
      { level: 'excellent', score: 40, desc: 'User flow ชัดเจน ใช้งานง่ายไม่ต้องเดา' },
      { level: 'good',      score: 30, desc: 'ส่วนใหญ่ดี มีบางจุดที่ต้องปรับ' },
      { level: 'fair',      score: 20, desc: 'บางขั้นตอนสับสน ต้องลองหลายครั้ง' },
      { level: 'poor',      score: 8,  desc: 'ใช้งานยาก flow ไม่ชัดเจน' },
    ]
  },
  {
    name: 'Visual Design', desc: 'สี typography spacing สม่ำเสมอ', max_score: 35,
    levels: [
      { level: 'excellent', score: 35, desc: 'Design สวยงาม สม่ำเสมอ มี visual hierarchy ชัด' },
      { level: 'good',      score: 26, desc: 'ดูดีเป็นส่วนใหญ่ บางจุดไม่สม่ำเสมอ' },
      { level: 'fair',      score: 17, desc: 'ขาด consistency หลายจุด' },
      { level: 'poor',      score: 5,  desc: 'Design ไม่สม่ำเสมอ อ่านยาก' },
    ]
  },
  {
    name: 'Design Process', desc: 'มี wireframe, prototype, user feedback', max_score: 25,
    levels: [
      { level: 'excellent', score: 25, desc: 'ทำ process ครบทุกขั้น มี rationale ชัดเจน' },
      { level: 'good',      score: 18, desc: 'ทำส่วนใหญ่ครบ ขาดบางขั้น' },
      { level: 'fair',      score: 12, desc: 'ข้าม process หลายขั้น' },
      { level: 'poor',      score: 4,  desc: 'ไม่มี design process' },
    ]
  },
]);

// Course 4 — React & State Management (teacher2)
const rubricReact = createRubric(courseIds[3], 'ตรวจ React Component', 'Component/State/Best Practice', [
  {
    name: 'โครงสร้าง Component และ JSX', desc: 'JSX ถูกต้อง, แบ่ง component เหมาะสม, key prop', max_score: 30,
    levels: [
      { level: 'excellent', score: 30, desc: 'Component แบ่งดีมาก JSX ถูกต้อง key prop ครบ' },
      { level: 'good',      score: 22, desc: 'ดีเป็นส่วนใหญ่ มีบางจุดปรับได้' },
      { level: 'fair',      score: 15, desc: 'Component ใหญ่เกิน หรือขาด key prop' },
      { level: 'poor',      score: 5,  desc: 'JSX ผิดพลาด ไม่แบ่ง component' },
    ]
  },
  {
    name: 'การใช้ State และ Props', desc: 'useState ถูกต้อง, ส่ง props ลง child, ไม่ mutate state', max_score: 40,
    levels: [
      { level: 'excellent', score: 40, desc: 'ใช้ state/props ถูกต้องทุกจุด ไม่มี mutation' },
      { level: 'good',      score: 30, desc: 'ถูกต้องส่วนใหญ่ มีบางจุดที่ปรับได้' },
      { level: 'fair',      score: 20, desc: 'มี state mutation หรือ props ผิดพลาด' },
      { level: 'poor',      score: 8,  desc: 'ใช้ state/props ผิดพลาดมาก' },
    ]
  },
  {
    name: 'Best Practice', desc: 'PascalCase component, ไม่มี logic ซับซ้อนใน JSX', max_score: 30,
    levels: [
      { level: 'excellent', score: 30, desc: 'ทำตาม best practice ครบ อ่านง่าย' },
      { level: 'good',      score: 22, desc: 'ดีเป็นส่วนใหญ่ มีบางจุดไม่ตาม convention' },
      { level: 'fair',      score: 15, desc: 'ละเลย best practice หลายจุด' },
      { level: 'poor',      score: 5,  desc: 'ไม่ทำตาม best practice เลย' },
    ]
  },
]);

// ─── Assignments ──────────────────────────────────────────────────────────────

const insertAssign = db.prepare(
  'INSERT INTO assignments (course_id, rubric_id, title, description, deadline) VALUES (?, ?, ?, ?, ?)'
);

const deadline1 = '2026-04-30T23:59:00';
const deadline2 = '2026-05-31T23:59:00';

// Course 1 — Web Frontend
const a1 = insertAssign.run(courseIds[0], rubricHTML, 'Lab 1 — สร้างหน้า Profile ด้วย HTML',
  'สร้างหน้า HTML แสดงข้อมูลส่วนตัว ใช้ semantic tag ให้ถูกต้อง', deadline1).lastInsertRowid;
const a2 = insertAssign.run(courseIds[0], rubricCSS,  'Lab 2 — Flexbox Navigation + Card Layout',
  'สร้าง Navbar + Card layout ด้วย Flexbox พร้อม Responsive', deadline2).lastInsertRowid;

// Course 2 — JavaScript Advanced
const a3 = insertAssign.run(courseIds[1], rubricJS, 'Lab 3 — เครื่องคิดเลขด้วย JavaScript',
  'สร้าง Calculator ไม่ใช้ eval() พร้อม handle หารด้วย 0', deadline1).lastInsertRowid;
const a4 = insertAssign.run(courseIds[1], rubricJS, 'Lab 4 — Fetch API + Filter',
  'ดึงข้อมูลจาก jsonplaceholder แสดง card + real-time search', deadline2).lastInsertRowid;

// Course 3 — UI/UX
const a5 = insertAssign.run(courseIds[2], rubricUIUX, 'Project 1 — Wireframe Mobile App',
  'ออกแบบ Wireframe สำหรับ Mobile App เลือกหัวข้อเอง', deadline1).lastInsertRowid;
const a6 = insertAssign.run(courseIds[2], rubricUIUX, 'Project 2 — Prototype + User Testing',
  'ทำ Prototype ใน Figma และนำไป User Testing อย่างน้อย 3 คน', deadline2).lastInsertRowid;

// Course 4 — React
const a7 = insertAssign.run(courseIds[3], rubricReact, 'Lab 7 — Todo List ด้วย React',
  'สร้าง Todo List พร้อม filter และ count', deadline1).lastInsertRowid;
const a8 = insertAssign.run(courseIds[3], rubricReact, 'Lab 8 — Shopping Cart ด้วย React',
  'สร้างร้านค้าอย่างง่าย มีตะกร้าสินค้าและคำนวณราคา', deadline2).lastInsertRowid;

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log('\n✅ Seed เสร็จสมบูรณ์\n');
console.log('═══════════════════════════════════════════════════════');
console.log('ACCOUNTS (password ทุกคน: 1234)');
console.log('═══════════════════════════════════════════════════════');
console.log('\n📋 TEACHERS');
console.log(`  teacher1@test.com  →  ${t1.name}  (id: ${t1.id})`);
console.log(`  teacher2@test.com  →  ${t2.name}  (id: ${t2.id})`);
console.log('\n🎓 STUDENTS (student01–10@test.com)');
studentRows.forEach(s => console.log(`  ${s.email}  →  ${s.name}  (id: ${s.id})`));

console.log('\n═══════════════════════════════════════════════════════');
console.log('COURSES');
console.log('═══════════════════════════════════════════════════════');
const courseNames = ['Web Frontend Development', 'JavaScript Advanced', 'UI/UX Design Fundamentals', 'React & State Management'];
courseIds.forEach((id, i) => console.log(`  [${id}] ${courseNames[i]}  →  ${i < 2 ? t1.name : t2.name}`));

console.log('\n═══════════════════════════════════════════════════════');
console.log('ASSIGNMENTS');
console.log('═══════════════════════════════════════════════════════');
console.log(`  [${a1}] Lab 1 — HTML Profile         (Course ${courseIds[0]}, Rubric HTML)`);
console.log(`  [${a2}] Lab 2 — Flexbox Layout        (Course ${courseIds[0]}, Rubric CSS)`);
console.log(`  [${a3}] Lab 3 — JS Calculator         (Course ${courseIds[1]}, Rubric JS)`);
console.log(`  [${a4}] Lab 4 — Fetch + Filter        (Course ${courseIds[1]}, Rubric JS)`);
console.log(`  [${a5}] Project 1 — Wireframe         (Course ${courseIds[2]}, Rubric UX)`);
console.log(`  [${a6}] Project 2 — Prototype         (Course ${courseIds[2]}, Rubric UX)`);
console.log(`  [${a7}] Lab 7 — React Todo List       (Course ${courseIds[3]}, Rubric React)`);
console.log(`  [${a8}] Lab 8 — Shopping Cart         (Course ${courseIds[3]}, Rubric React)`);

console.log('\n═══════════════════════════════════════════════════════');
console.log('RUBRICS (with Levels)');
console.log('═══════════════════════════════════════════════════════');
console.log(`  [${rubricHTML}] HTML Structure     (Course ${courseIds[0]})`);
console.log(`  [${rubricCSS}]  CSS Layout         (Course ${courseIds[0]})`);
console.log(`  [${rubricJS}]  JavaScript Logic   (Course ${courseIds[1]})`);
console.log(`  [${rubricUIUX}]  UI/UX Design       (Course ${courseIds[2]})`);
console.log(`  [${rubricReact}]  React Component    (Course ${courseIds[3]})`);

console.log('\n⚠️  หมายเหตุ: Custom Rubric Override ยังไม่ได้ implement');
console.log('    assignment แต่ละอันใช้ rubric template เดิม');
console.log('═══════════════════════════════════════════════════════\n');

db.close();
