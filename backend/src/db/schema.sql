-- =============================================
-- AI Grading & Feedback System - Database Schema
-- =============================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------
-- ACTIVITY LOGS
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS activity_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  INTEGER,
  detail     TEXT,
  ip         TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------
-- USERS
-- role: 'admin' | 'teacher' | 'student'
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  username    TEXT    NOT NULL UNIQUE,
  password    TEXT    NOT NULL,
  role        TEXT    NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------
-- COURSES
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS courses (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT    NOT NULL,
  description      TEXT,
  teacher_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  join_code        TEXT    UNIQUE,
  color            TEXT    NOT NULL DEFAULT 'indigo',
  enrollment_open  INTEGER NOT NULL DEFAULT 1,
  archived         INTEGER NOT NULL DEFAULT 0,
  semester         TEXT,
  created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------
-- ENROLLMENTS (นักเรียน <-> วิชา)
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS enrollments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id   INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  group_no    TEXT,
  enrolled_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (student_id, course_id)
);

-- ---------------------------------------------
-- RUBRIC TEMPLATES (ระดับ Course)
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS rubric_templates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id   INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  description TEXT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------
-- RUBRIC CRITERIA (เกณฑ์ของ Rubric แต่ละข้อ)
-- min_score / max_score: range คะแนนสำหรับ criteria นี้ (ครูกำหนดเองได้)
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS rubric_criteria (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  rubric_id   INTEGER NOT NULL REFERENCES rubric_templates(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  description TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  min_score   INTEGER NOT NULL DEFAULT 1,
  max_score   INTEGER NOT NULL DEFAULT 4
);

-- ---------------------------------------------
-- RUBRIC LEVELS (descriptor ต่อระดับของแต่ละ criteria)
-- score: ค่าคะแนนจำนวนเต็ม (ครูกำหนดเอง, ต้องอยู่ใน min_score-max_score)
-- label: ชื่อระดับที่ครูตั้งเอง (เช่น "ดีเยี่ยม", "ผ่าน", "ต้องปรับปรุง")
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS rubric_levels (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  rubric_criteria_id INTEGER NOT NULL REFERENCES rubric_criteria(id) ON DELETE CASCADE,
  score              INTEGER NOT NULL,
  label              TEXT    NOT NULL DEFAULT '',
  description        TEXT    NOT NULL DEFAULT '',
  UNIQUE (rubric_criteria_id, score)
);

-- ---------------------------------------------
-- ASSIGNMENTS (งานที่อาจารย์มอบหมาย)
-- 1 assignment มี 1 rubric
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS assignments (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id               INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  rubric_id               INTEGER REFERENCES rubric_templates(id) ON DELETE SET NULL,
  title                   TEXT    NOT NULL,
  description             TEXT,
  deadline                TEXT,
  auto_approve_threshold  REAL,     -- avg level ขั้นต่ำที่จะ auto-approve (1.0-4.0), NULL = ปิด
  assignment_type         TEXT,     -- 'essay' | 'problem_set' | 'code_review' | 'other' | NULL
  calibration_examples    TEXT,
  is_open                 INTEGER NOT NULL DEFAULT 0,
  allow_paste             INTEGER NOT NULL DEFAULT 1,  -- 0 = บังคับพิมพ์เอง ห้าม paste
  created_at              TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------
-- SUBMISSIONS (งานที่นักเรียน submit - resubmit ได้)
-- status: 'pending' | 'grading' | 'graded' | 'approved' | 'rejected'
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS submissions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id   INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_path       TEXT,
  content_text    TEXT,
  attempt         INTEGER NOT NULL DEFAULT 1,
  status          TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','grading','graded','approved','rejected')),
  submission_type TEXT    NOT NULL DEFAULT 'text' CHECK (submission_type IN ('text','image')),
  submitted_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------
-- GRADING JOBS (background job สำหรับ LLM)
-- status: 'pending' | 'running' | 'done' | 'failed'
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS grading_jobs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  status        TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed')),
  error         TEXT,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------
-- ASSIGNMENT RUBRIC OVERRIDE (criteria พิเศษสำหรับ assignment นั้นๆ)
-- ถ้ามี override → ใช้แทน rubric template ใน grading
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS assignment_rubric_overrides (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER NOT NULL UNIQUE REFERENCES assignments(id) ON DELETE CASCADE,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS assignment_override_criteria (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  override_id              INTEGER NOT NULL REFERENCES assignment_rubric_overrides(id) ON DELETE CASCADE,
  name                     TEXT    NOT NULL,
  description              TEXT,
  order_index              INTEGER NOT NULL DEFAULT 0,
  min_score                INTEGER NOT NULL DEFAULT 1,
  max_score                INTEGER NOT NULL DEFAULT 4
);

CREATE TABLE IF NOT EXISTS assignment_override_levels (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  override_criteria_id     INTEGER NOT NULL REFERENCES assignment_override_criteria(id) ON DELETE CASCADE,
  score                    INTEGER NOT NULL,
  label                    TEXT    NOT NULL DEFAULT '',
  description              TEXT    NOT NULL DEFAULT '',
  UNIQUE (override_criteria_id, score)
);

-- ---------------------------------------------
-- GRADES (ผลการให้คะแนนจาก LLM แต่ละ Criteria)
-- level: integer คะแนนที่ AI ให้ (อยู่ใน min_score-max_score ของ criteria)
-- level_label: ชื่อระดับที่ตรงกับ score (snapshot จาก rubric_levels.label)
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS grades (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id            INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  rubric_criteria_id       INTEGER REFERENCES rubric_criteria(id) ON DELETE SET NULL,
  override_criteria_id     INTEGER REFERENCES assignment_override_criteria(id) ON DELETE SET NULL,
  criteria_name            TEXT,
  level                    INTEGER NOT NULL CHECK (level >= 1 AND level <= 100),
  level_label              TEXT,
  reasoning                TEXT,
  feedback                 TEXT,
  created_at               TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------
-- GRADE APPROVALS (อาจารย์ approve/reject/แก้คะแนน)
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS grade_approvals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  teacher_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action        TEXT    NOT NULL CHECK (action IN ('approved','rejected','edited')),
  note          TEXT,
  final_level   REAL,   -- avg level ที่อาจารย์แก้ไข (1.0-4.0), NULL = ใช้ avg จาก grades
  approved_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------
-- CORRECTION EXAMPLES (ประวัติที่อาจารย์แก้คะแนน AI — ใช้เป็น few-shot ใน prompt)
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS correction_examples (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id   INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  submission_text TEXT    NOT NULL,
  original_score  REAL    NOT NULL,
  final_level     REAL    NOT NULL,
  note            TEXT,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------
-- GRADING SETTINGS (ตั้งค่า LLM สำหรับ grading)
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS grading_settings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  UNIQUE(teacher_id, key)
);

-- ---------------------------------------------
-- APPEALS (นักเรียน appeal คะแนน)
-- status: 'pending' | 'resolved'
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS appeals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  student_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason        TEXT    NOT NULL,
  status        TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved')),
  teacher_response TEXT,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- =============================================
-- INDEXES
-- =============================================
-- courses
CREATE INDEX IF NOT EXISTS idx_courses_teacher       ON courses(teacher_id);
-- assignments
CREATE INDEX IF NOT EXISTS idx_assignments_course    ON assignments(course_id);
CREATE INDEX IF NOT EXISTS idx_assignments_rubric    ON assignments(rubric_id);
-- submissions
CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student    ON submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status     ON submissions(status);
-- grading_jobs
CREATE INDEX IF NOT EXISTS idx_grading_jobs_submission ON grading_jobs(submission_id);
CREATE INDEX IF NOT EXISTS idx_grading_jobs_status     ON grading_jobs(status);
-- grades
CREATE INDEX IF NOT EXISTS idx_grades_submission      ON grades(submission_id);
-- grade_approvals
CREATE INDEX IF NOT EXISTS idx_grade_approvals_submission ON grade_approvals(submission_id);
-- appeals
CREATE INDEX IF NOT EXISTS idx_appeals_submission     ON appeals(submission_id);
CREATE INDEX IF NOT EXISTS idx_appeals_student        ON appeals(student_id);
-- enrollments
CREATE INDEX IF NOT EXISTS idx_enrollments_course     ON enrollments(course_id);
-- rubric_criteria / levels
CREATE INDEX IF NOT EXISTS idx_rubric_criteria_rubric ON rubric_criteria(rubric_id);
CREATE INDEX IF NOT EXISTS idx_rubric_levels_criteria ON rubric_levels(rubric_criteria_id);
-- override tables
CREATE INDEX IF NOT EXISTS idx_override_criteria_override ON assignment_override_criteria(override_id);
CREATE INDEX IF NOT EXISTS idx_override_levels_criteria   ON assignment_override_levels(override_criteria_id);
-- correction examples
CREATE INDEX IF NOT EXISTS idx_correction_assignment  ON correction_examples(assignment_id);

-- ---------------------------------------------
-- EXAMS & QUESTIONS
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS exams (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id        INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title            TEXT    NOT NULL,
  description      TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  is_open          INTEGER NOT NULL DEFAULT 1,
  is_published     INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS exam_questions (
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
);

CREATE TABLE IF NOT EXISTS exam_submissions (
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
);

CREATE TABLE IF NOT EXISTS exam_answers (
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
);

CREATE INDEX IF NOT EXISTS idx_exams_course ON exams(course_id);
CREATE INDEX IF NOT EXISTS idx_exam_questions_exam ON exam_questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_submissions_exam ON exam_submissions(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_submissions_student ON exam_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_exam_answers_sub ON exam_answers(submission_id);

