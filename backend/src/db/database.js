import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { randomBytes } from "crypto";

function generateJoinCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[bytes[i] % chars.length];
  return code.slice(0, 3) + "-" + code.slice(3);
}

const __dirname = dirname(fileURLToPath(import.meta.url));

const db = new Database(join(__dirname, "../../data/app.db"));

// Enable WAL mode for better performance
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Initialize schema
const schema = readFileSync(join(__dirname, "schema.sql"), "utf-8");
db.exec(schema);

// Migrations — เพิ่ม column ใหม่ถ้ายังไม่มี (safe for existing DB)
const migrations = [
  `ALTER TABLE assignments ADD COLUMN auto_approve_threshold INTEGER`,
  `ALTER TABLE assignments ADD COLUMN assignment_type TEXT`,
  `ALTER TABLE grades ADD COLUMN criteria_name TEXT`,
  `ALTER TABLE courses ADD COLUMN join_code TEXT`,
  `ALTER TABLE courses ADD COLUMN color TEXT NOT NULL DEFAULT 'indigo'`,
  `ALTER TABLE enrollments ADD COLUMN group_no TEXT`,
  `ALTER TABLE courses ADD COLUMN enrollment_open INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE courses ADD COLUMN archived INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE assignments ADD COLUMN calibration_examples TEXT`,
  `ALTER TABLE assignments ADD COLUMN is_open INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE grade_approvals ADD COLUMN original_score INTEGER`,
  `ALTER TABLE grade_approvals ADD COLUMN final_level REAL`,
  `ALTER TABLE grades ADD COLUMN level INTEGER`,
  `ALTER TABLE courses ADD COLUMN semester TEXT`,
  `ALTER TABLE assignments ADD COLUMN allow_paste INTEGER NOT NULL DEFAULT 1`,
  `CREATE TABLE IF NOT EXISTS correction_examples (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    assignment_id   INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    submission_text TEXT    NOT NULL,
    original_score  REAL    NOT NULL,
    final_level     REAL    NOT NULL,
    note            TEXT,
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,
  `CREATE TABLE IF NOT EXISTS assignment_grading_settings (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    assignment_id         INTEGER NOT NULL UNIQUE REFERENCES assignments(id) ON DELETE CASCADE,
    ollama_temperature    REAL,
    ollama_top_p          REAL,
    ollama_repeat_penalty REAL,
    ollama_num_predict    INTEGER,
    ollama_seed           INTEGER,
    created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,
  // Flexible rubric scoring — per-criteria min/max score
  `ALTER TABLE rubric_criteria ADD COLUMN min_score INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE rubric_criteria ADD COLUMN max_score INTEGER NOT NULL DEFAULT 3`,
  `ALTER TABLE assignment_override_criteria ADD COLUMN min_score INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE assignment_override_criteria ADD COLUMN max_score INTEGER NOT NULL DEFAULT 3`,
  `ALTER TABLE grades ADD COLUMN max_score INTEGER`,
  `ALTER TABLE grades ADD COLUMN level_label TEXT`,
  // Migrate min_score 0→1, max_score 3→4 to enforce 1-4 scale (no level 0)
  `UPDATE rubric_criteria SET min_score = 1 WHERE min_score = 0`,
  `UPDATE rubric_criteria SET max_score = 4 WHERE max_score = 3`,
  `UPDATE assignment_override_criteria SET min_score = 1 WHERE min_score = 0`,
  `UPDATE assignment_override_criteria SET max_score = 4 WHERE max_score = 3`,
  `UPDATE grades SET level = 1 WHERE level = 0`,
  `ALTER TABLE submissions ADD COLUMN submission_type TEXT NOT NULL DEFAULT 'text' CHECK (submission_type IN ('text','image'))`,
  // grading_settings: SQLite ไม่กัน UNIQUE(teacher_id, key) ซ้ำเมื่อ teacher_id เป็น NULL
  // (NULL != NULL ตาม SQL standard) ทำให้สะสมแถวซ้ำทุกครั้งที่ global settings ถูก save
  // ล้างแถวซ้ำ เหลือไว้แค่ id ล่าสุดต่อ (teacher_id, key)
  `DELETE FROM grading_settings WHERE id NOT IN (
    SELECT MAX(id) FROM grading_settings GROUP BY COALESCE(teacher_id, -1), key
  )`,
  // Exam Platform tables
  `CREATE TABLE IF NOT EXISTS exams (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id        INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title            TEXT    NOT NULL,
    description      TEXT,
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    is_open          INTEGER NOT NULL DEFAULT 1,
    is_published     INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,
  `CREATE TABLE IF NOT EXISTS exam_questions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id          INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    question_order   INTEGER NOT NULL DEFAULT 1,
    question_type    TEXT    NOT NULL CHECK (question_type IN ('mcq', 'coding', 'short_answer')),
    prompt           TEXT    NOT NULL,
    points           REAL    NOT NULL DEFAULT 1.0,
    options          TEXT,
    correct_option   TEXT,
    starter_code     TEXT,
    solution_guide   TEXT,
    created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,
  `CREATE TABLE IF NOT EXISTS exam_submissions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id          INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    student_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    submitted_at     TEXT,
    status           TEXT    NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'graded')),
    score            REAL,
    max_score        REAL,
    feedback         TEXT,
    tab_switch_count INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(exam_id, student_id)
  )`,
  `CREATE TABLE IF NOT EXISTS exam_answers (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id    INTEGER NOT NULL REFERENCES exam_submissions(id) ON DELETE CASCADE,
    question_id      INTEGER NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
    student_answer   TEXT,
    auto_score       REAL    DEFAULT 0,
    manual_score     REAL,
    is_correct       INTEGER,
    feedback         TEXT,
    created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(submission_id, question_id)
  )`,
  `ALTER TABLE exams ADD COLUMN allow_paste INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE exams ADD COLUMN require_fullscreen INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE exam_submissions ADD COLUMN ip_address TEXT`,
  `ALTER TABLE exam_submissions ADD COLUMN switch_events TEXT`,
  `CREATE TABLE IF NOT EXISTS announcements (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id  INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT    NOT NULL,
    content    TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,
  `ALTER TABLE exam_questions ADD COLUMN test_cases TEXT`,
  `ALTER TABLE exam_questions ADD COLUMN test_driver TEXT`,
  `ALTER TABLE exam_questions ADD COLUMN language TEXT NOT NULL DEFAULT 'java'`,
  `ALTER TABLE exam_answers ADD COLUMN test_case_results TEXT`,
  `ALTER TABLE exams ADD COLUMN shuffle_questions INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE exams ADD COLUMN shuffle_options INTEGER NOT NULL DEFAULT 0`,
];
for (const sql of migrations) {
  try {
    db.exec(sql);
  } catch {
    /* column already exists */
  }
}

// Migration พิเศษ: rebuild rubric_levels ถ้ายังใช้ level TEXT (schema เก่า)
try {
  const lvCols = db
    .prepare("PRAGMA table_info(rubric_levels)")
    .all()
    .map((c) => c.name);
  if (lvCols.includes("level") && !lvCols.includes("score")) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE rubric_levels_new (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        rubric_criteria_id INTEGER NOT NULL REFERENCES rubric_criteria(id) ON DELETE CASCADE,
        score              INTEGER NOT NULL,
        label              TEXT    NOT NULL DEFAULT '',
        description        TEXT    NOT NULL DEFAULT '',
        UNIQUE (rubric_criteria_id, score)
      );
      INSERT INTO rubric_levels_new (id, rubric_criteria_id, score, label, description)
        SELECT id, rubric_criteria_id,
          CASE level WHEN 'excellent' THEN 4 WHEN 'good' THEN 3 WHEN 'fair' THEN 2 WHEN 'poor' THEN 1 ELSE 1 END,
          CASE level WHEN 'excellent' THEN 'ดีเยี่ยม' WHEN 'good' THEN 'ดี' WHEN 'fair' THEN 'พอใช้' WHEN 'poor' THEN 'ต้องปรับปรุง' ELSE level END,
          COALESCE(description, '')
        FROM rubric_levels;
      DROP TABLE rubric_levels;
      ALTER TABLE rubric_levels_new RENAME TO rubric_levels;
      PRAGMA foreign_keys = ON;
    `);
  }
} catch {
  /* already migrated */
}

// Migration พิเศษ: rebuild assignment_override_levels ถ้ายังใช้ level TEXT (schema เก่า)
try {
  const ovCols = db
    .prepare("PRAGMA table_info(assignment_override_levels)")
    .all()
    .map((c) => c.name);
  if (ovCols.includes("level") && !ovCols.includes("score")) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE assignment_override_levels_new (
        id                   INTEGER PRIMARY KEY AUTOINCREMENT,
        override_criteria_id INTEGER NOT NULL REFERENCES assignment_override_criteria(id) ON DELETE CASCADE,
        score                INTEGER NOT NULL,
        label                TEXT    NOT NULL DEFAULT '',
        description          TEXT    NOT NULL DEFAULT '',
        UNIQUE (override_criteria_id, score)
      );
      INSERT INTO assignment_override_levels_new (id, override_criteria_id, score, label, description)
        SELECT id, override_criteria_id,
          CASE level WHEN 'excellent' THEN 4 WHEN 'good' THEN 3 WHEN 'fair' THEN 2 WHEN 'poor' THEN 1 ELSE 1 END,
          CASE level WHEN 'excellent' THEN 'ดีเยี่ยม' WHEN 'good' THEN 'ดี' WHEN 'fair' THEN 'พอใช้' WHEN 'poor' THEN 'ต้องปรับปรุง' ELSE level END,
          COALESCE(description, '')
        FROM assignment_override_levels;
      DROP TABLE assignment_override_levels;
      ALTER TABLE assignment_override_levels_new RENAME TO assignment_override_levels;
      PRAGMA foreign_keys = ON;
    `);
  }
} catch {
  /* already migrated */
}

// Migration พิเศษ: ขยาย CHECK constraint ของ users.role ให้รองรับ 'admin'
try {
  const tableInfo = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='users'",
    )
    .get();
  if (tableInfo && !tableInfo.sql.includes("'admin'")) {
    db.exec(`
      CREATE TABLE users_new (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT    NOT NULL,
        username    TEXT    NOT NULL UNIQUE,
        password    TEXT    NOT NULL,
        role        TEXT    NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
        created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      INSERT INTO users_new SELECT * FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
    `);
  }
} catch {
  /* already migrated */
}

// Migration พิเศษ: rebuild grading_settings ให้รองรับ per-teacher settings
// ถ้ายังเป็น schema เก่า (PRIMARY KEY = key, ไม่มี teacher_id)
try {
  const cols = db
    .prepare("PRAGMA table_info(grading_settings)")
    .all()
    .map((c) => c.name);
  if (!cols.includes("teacher_id")) {
    db.exec(`
      CREATE TABLE grading_settings_new (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        teacher_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        key        TEXT NOT NULL,
        value      TEXT NOT NULL,
        UNIQUE(teacher_id, key)
      );
      INSERT INTO grading_settings_new (teacher_id, key, value)
        SELECT NULL, key, value FROM grading_settings;
      DROP TABLE grading_settings;
      ALTER TABLE grading_settings_new RENAME TO grading_settings;
    `);
  }
} catch {
  /* already migrated */
}

// Backfill join_code สำหรับ courses เดิมที่ยังไม่มี
const coursesWithoutCode = db
  .prepare("SELECT id FROM courses WHERE join_code IS NULL")
  .all();
const updateJoinCode = db.prepare(
  "UPDATE courses SET join_code = ? WHERE id = ?",
);
const allCodes = new Set(
  db
    .prepare("SELECT join_code FROM courses WHERE join_code IS NOT NULL")
    .all()
    .map((r) => r.join_code),
);
for (const row of coursesWithoutCode) {
  let code;
  do {
    code = generateJoinCode();
  } while (allCodes.has(code));
  allCodes.add(code);
  updateJoinCode.run(code, row.id);
}

// Seed global default grading settings (teacher_id = NULL) ถ้ายังไม่มี
const defaultSettings = [
  ["ollama_url", process.env.OLLAMA_URL || "http://10.80.39.41:11941"],
  ["ollama_model", process.env.OLLAMA_MODEL || "qwen3-coder:30b"],
  ["ollama_temperature", "0.2"],
  ["ollama_top_p", "0.9"],
  ["ollama_repeat_penalty", "1.1"],
  ["ollama_num_predict", "2048"],
  ["ollama_seed", "42"],
];
// ใช้ WHERE NOT EXISTS เพราะ SQLite ถือว่า NULL != NULL ทำให้ INSERT OR IGNORE ไม่ทำงานกับ teacher_id = NULL
const insertSetting = db.prepare(
  "INSERT INTO grading_settings (teacher_id, key, value) SELECT NULL, ?, ? WHERE NOT EXISTS (SELECT 1 FROM grading_settings WHERE teacher_id IS NULL AND key = ?)",
);
for (const [key, value] of defaultSettings) {
  insertSetting.run(key, value, key);
}

// Auto seed admin account ถ้ายังไม่มีในระบบ
if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
  const adminExists = db
    .prepare("SELECT id FROM users WHERE role = 'admin'")
    .get();
  if (!adminExists) {
    const hashed = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10);
    db.prepare(
      "INSERT INTO users (name, username, password, role) VALUES (?, ?, ?, ?)",
    ).run(
      process.env.ADMIN_NAME || "Admin",
      process.env.ADMIN_USERNAME,
      hashed,
      "admin",
    );
    console.log(
      `[startup] Admin account created: username="${process.env.ADMIN_USERNAME}"`,
    );
  }
}

// Reset grading jobs ที่ค้างอยู่ตอน server restart
db.prepare(
  `UPDATE submissions SET status = 'pending' WHERE status = 'grading'`,
).run();
db.prepare(
  `UPDATE grading_jobs SET status = 'failed', error = 'Server restarted' WHERE status IN ('pending', 'running')`,
).run();

// ponytail: SQLite column DEFAULT is baked in at CREATE TABLE time, so fixing
// schema.sql doesn't retroactively fix existing tables' defaults. Use this
// for any new/updated timestamp inserts instead of relying on the DB default.
export function nowUTC() {
  return new Date().toISOString();
}

export default db;
