# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.5.0] - 2026-09-10

### Added
- **AI-drafted rubrics**: Teacher types the assignment description, picks how many criteria, and gets a full draft (name, description, N criteria, 4 grader-oriented Thai levels each) to edit and save through the normal flow
  - `POST /api/rubrics/generate` — course rubric template draft
  - `POST /api/assignments/:id/rubric-override/generate` — assignment override draft
  - Draft only: nothing is written to the DB until the teacher saves; no schema or grading-pipeline changes
  - Level descriptions are framed for the AI grader — observable, checkable, adjacent levels distinguishable
- **One-click standard levels**: "เติมระดับมาตรฐาน" button fills ดีมาก/ดี/พอใช้/ต้องปรับปรุง across every criterion at once (both rubric forms)

### Changed
- **Rubric levels are now optional**: level rows are no longer auto-generated on min/max change or panel open; the AI grader falls back to the score range + criterion description when levels are left blank
- Admin grading `seed` defaults to `42` for reproducible AI grading
- Activity-log timestamps forced to Asia/Bangkok

---

## [1.4.0] - 2026-07-20

### Added
- **Hand-drawn / pasted image submissions**: students can draw or paste an image as their answer; graded by a vision model
- Submission tabs reordered to text → draw → file

### Fixed
- Guard falsy `level=0` and empty LLM grading results

---

## [1.3.1] - 2026-07-16

### Fixed
- **Submission Timestamp Off By 7 Hours**: Student submission times displayed in UTC instead of Thailand local time (UTC+7)
  - `submitted_at` no longer relies on SQLite's `datetime('now', 'localtime')` column default, which was baked into existing production tables and unaffected by schema changes
  - Backend now writes an explicit UTC ISO timestamp on submission insert; frontend already converts correctly via `toLocaleString("th-TH")`
  - See `BUg-FIX-TZ.md` for full root-cause writeup
  - Note: only new submissions are corrected — timestamps recorded before this fix are unchanged

---

## [1.3.0] - 2026-07-14

### Added
- **Assignment "No Paste" Mode**: Teacher can set `allow_paste = false` per assignment to require students to type answers directly
  - New `assignments.allow_paste` column (INTEGER, DEFAULT 1)
  - Student submission page: when disabled, hides file-upload tab and forces text-only mode; blocks paste/drop on the textarea (frontend)
  - `POST /assignments/:id/submit`: rejects file uploads server-side when `allow_paste = 0` (backend enforcement, uploaded file is deleted)
  - Teacher UI: new checkbox "อนุญาตให้วางข้อความ (paste)" in the assignment create/edit form

---

## [1.2.1] - 2026-06-30

### Added
- **Admin Backup Feature**: `GET /api/admin/backup/db` endpoint for admin-only SQLite database download
- **ER Diagram**: Database schema documentation with Mermaid ERD visualization

### Fixed
- **Score Denominator Bug**: Display now uses actual rubric `max_score` instead of hardcoded `/4.00`
  - Fixes issue where rubric with max=3 displayed as `/4.00` instead of `/3.00`
  - Backend routes now calculate and return `max_level` from criteria

### Changed
- **Rubric Scale Standardized to 1-4**: 
  - `rubric_criteria.min_score` default `0 → 1`
  - `rubric_criteria.max_score` default `3 → 4`
  - `assignment_override_criteria` defaults updated similarly
  - `grades.level` CHECK constraint: `>= 0` → `>= 1`
  - AI prompt now specifies range `1-4` (not `0-3`)
- **Database Migration** (automatic on backend start):
  - Existing rows with `min_score=0` updated to `1`
  - Existing rows with `max_score=3` updated to `4`
  - Existing `grades.level=0` updated to `1`
- **Frontend Display**: All score displays now dynamic based on API `max_level` fallback
  - Student/Teacher pages: `/4.00` → `/{max_level}`
  - Progress bars: `/ 4` → `/ max_level`

### Documentation
- Updated README, API-DOC, RUBRIC, MANUAL, WORKFLOW, DOCKER-DEPLOY for v1.2.1
- Added ER-DIAGRAM.md with database schema visualization

---

## [1.2.0] - 2026-06-29

### Added
- Flexible Rubric Scoring: Per-criteria `min_score` and `max_score` (not hardcoded 1-4)
- Assignment Rubric Override: Custom criteria per assignment via `/api/admin/override` endpoints

### Changed
- Rubric system now supports arbitrary score ranges (previously 0-3 only)
- Database schema: Added `min_score`, `max_score` columns to rubric tables

---

## [1.1.1] - 2026-06-28

### Fixed
- Minor UI improvements in grade approval flow

---

## [1.1.0] - 2026-06-15

### Added
- Appeal System: Students can appeal grades, teachers can respond
- Grade Approval Workflow: Approve/Reject/Edit with audit trail
- Auto-Approve Threshold: Per-assignment setting for automatic approval at score threshold
- Consistency Report: Variance and outlier detection per criteria
- Calibration Examples: Teacher-provided few-shot examples for AI prompt refinement
- Bulk Approve: Approve all graded submissions in one action
- Activity Logging: Audit trail for admin and teacher actions

### Changed
- Grade display refactored to support dual paths (AI + Teacher approval)
- Submission status flow: `pending` → `grading` → `graded` → `approved` | `rejected`

---

## [1.0.0] - 2026-06-01

### Added
- **Core Grading System**: AI-powered assignment grading using Ollama LLM
- **Rubric Templates**: Course-level rubric templates with criteria and levels
- **Role-Based Access**: Admin, Teacher, Student roles with permission enforcement
- **Course Management**: Create/manage courses, assignments, deadlines
- **Student Enrollment**: Join via join code, manual import from CSV
- **Submission Handling**: File upload (PDF, DOCX, TXT), text submission, resubmit
- **AI Grading**: Background job queue for LLM grading with status polling
- **Feedback**: AI-generated feedback per criteria with reasoning
- **File Parsing**: Extract text from PDF (pdf-parse) and DOCX (mammoth)
- **Export Features**: 
  - Export grades to CSV (latest or best score per assignment)
  - Export student rosters
  - Download submissions
- **Student Views**:
  - View assignment details
  - View submission history and feedback
  - View class average comparison
- **Teacher Views**:
  - Submission review interface with side-by-side display
  - Grade extraction and manual override
  - Student performance analytics
  - Course statistics dashboard
- **Admin Features**:
  - User management (create/reset teachers)
  - Global LLM settings (Ollama URL, model, parameters)
  - Activity audit log
- **Authentication**: JWT-based auth with bcryptjs password hashing
- **Database**: SQLite with foreign key constraints and indexes
- **Frontend**: React + Vite with Tailwind CSS, TanStack Query (React Query)
- **API**: RESTful API with proper error handling and rate limiting

---

## Unreleased

### Planned
- Student group management improvements
- Advanced analytics dashboard
- Mobile-responsive improvements
- Performance optimizations for large datasets

