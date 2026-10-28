-- =============================================
-- Migration 001: Flexible Rubric Levels
-- =============================================
-- ใช้กับ database ที่มีข้อมูลอยู่แล้ว (ที่ใช้ named levels 'excellent/good/fair/poor')
-- ถ้าเป็น database ใหม่ ให้ใช้ schema.sql ได้เลย ไม่ต้อง migrate
--
-- วิธีรัน (จาก project root):
--   sqlite3 backend/data/database.sqlite < backend/src/db/migration-001-flexible-rubric.sql
-- =============================================

PRAGMA foreign_keys = OFF;
BEGIN;

-- ─── 1. เพิ่ม min_score / max_score ใน rubric_criteria ──────────────────────
ALTER TABLE rubric_criteria ADD COLUMN min_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rubric_criteria ADD COLUMN max_score INTEGER NOT NULL DEFAULT 3;

-- ─── 2. เพิ่ม min_score / max_score ใน assignment_override_criteria ──────────
ALTER TABLE assignment_override_criteria ADD COLUMN min_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE assignment_override_criteria ADD COLUMN max_score INTEGER NOT NULL DEFAULT 3;

-- ─── 3. migrate rubric_levels: level TEXT → score INT + label TEXT ────────────
-- สร้าง table ใหม่
CREATE TABLE rubric_levels_new (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  rubric_criteria_id INTEGER NOT NULL REFERENCES rubric_criteria(id) ON DELETE CASCADE,
  score              INTEGER NOT NULL,
  label              TEXT    NOT NULL DEFAULT '',
  description        TEXT    NOT NULL DEFAULT '',
  UNIQUE (rubric_criteria_id, score)
);

-- ย้ายข้อมูลเดิม: map ชื่อ level → score และ label ภาษาไทย
INSERT INTO rubric_levels_new (rubric_criteria_id, score, label, description)
SELECT
  rubric_criteria_id,
  CASE level
    WHEN 'excellent' THEN 4
    WHEN 'good'      THEN 3
    WHEN 'fair'      THEN 2
    WHEN 'poor'      THEN 1
    ELSE 1
  END AS score,
  CASE level
    WHEN 'excellent' THEN 'ดีเยี่ยม'
    WHEN 'good'      THEN 'ดี'
    WHEN 'fair'      THEN 'พอใช้'
    WHEN 'poor'      THEN 'ต้องปรับปรุง'
    ELSE level
  END AS label,
  description
FROM rubric_levels;

DROP TABLE rubric_levels;
ALTER TABLE rubric_levels_new RENAME TO rubric_levels;

-- ─── 4. migrate assignment_override_levels: เหมือนกัน ───────────────────────
CREATE TABLE assignment_override_levels_new (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  override_criteria_id INTEGER NOT NULL REFERENCES assignment_override_criteria(id) ON DELETE CASCADE,
  score                INTEGER NOT NULL,
  label                TEXT    NOT NULL DEFAULT '',
  description          TEXT    NOT NULL DEFAULT '',
  UNIQUE (override_criteria_id, score)
);

INSERT INTO assignment_override_levels_new (override_criteria_id, score, label, description)
SELECT
  override_criteria_id,
  CASE level
    WHEN 'excellent' THEN 4
    WHEN 'good'      THEN 3
    WHEN 'fair'      THEN 2
    WHEN 'poor'      THEN 1
    ELSE 1
  END AS score,
  CASE level
    WHEN 'excellent' THEN 'ดีเยี่ยม'
    WHEN 'good'      THEN 'ดี'
    WHEN 'fair'      THEN 'พอใช้'
    WHEN 'poor'      THEN 'ต้องปรับปรุง'
    ELSE level
  END AS label,
  description
FROM assignment_override_levels;

DROP TABLE assignment_override_levels;
ALTER TABLE assignment_override_levels_new RENAME TO assignment_override_levels;

-- ─── 5. migrate grades: ลบ CHECK (IN 1,2,3,4) + ADD level_label ──────────────
CREATE TABLE grades_new (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id        INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  rubric_criteria_id   INTEGER REFERENCES rubric_criteria(id) ON DELETE SET NULL,
  override_criteria_id INTEGER REFERENCES assignment_override_criteria(id) ON DELETE SET NULL,
  criteria_name        TEXT,
  level                INTEGER NOT NULL CHECK (level >= 0 AND level <= 100),
  level_label          TEXT,
  reasoning            TEXT,
  feedback             TEXT,
  created_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO grades_new (id, submission_id, rubric_criteria_id, override_criteria_id,
                        criteria_name, level, level_label, reasoning, feedback, created_at)
SELECT
  id, submission_id, rubric_criteria_id, override_criteria_id,
  criteria_name, level,
  CASE level
    WHEN 4 THEN 'ดีเยี่ยม'
    WHEN 3 THEN 'ดี'
    WHEN 2 THEN 'พอใช้'
    WHEN 1 THEN 'ต้องปรับปรุง'
    ELSE NULL
  END AS level_label,
  reasoning, feedback, created_at
FROM grades;

DROP TABLE grades;
ALTER TABLE grades_new RENAME TO grades;

COMMIT;
PRAGMA foreign_keys = ON;
