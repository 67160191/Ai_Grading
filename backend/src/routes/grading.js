import { Router } from "express";
import { existsSync, readFileSync } from "fs";
import { unlink } from "fs/promises";
import { join, dirname, extname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import mammoth from "mammoth";
import db from "../db/database.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { buildPreviewPrompt, processNextPending } from "../services/grading.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pdfParse = createRequire(import.meta.url)("pdf-parse");

const router = Router();

// POST /api/submissions/:id/grade — teacher สั่ง grade (หรือ re-grade)
router.post(
  "/submissions/:id/grade",
  authenticate,
  requireRole("teacher"),
  (req, res) => {
    const submission = db
      .prepare(
        `
    SELECT s.* FROM submissions s
    JOIN assignments a ON a.id = s.assignment_id
    JOIN courses c ON c.id = a.course_id
    WHERE s.id = ? AND c.teacher_id = ?
  `,
      )
      .get(req.params.id, req.user.id);

    if (!submission)
      return res.status(404).json({ error: "Submission not found" });

    const assignment = db
      .prepare("SELECT * FROM assignments WHERE id = ?")
      .get(submission.assignment_id);
    const hasOverride = !!db
      .prepare(
        "SELECT id FROM assignment_rubric_overrides WHERE assignment_id = ?",
      )
      .get(assignment.id);
    if (!assignment.rubric_id && !hasOverride) {
      return res.status(400).json({
        error:
          "Assignment has no rubric or custom override. Please assign a rubric first.",
      });
    }

    // ยกเลิก job เก่าที่ยัง pending/running อยู่
    db.prepare(
      `
    UPDATE grading_jobs SET status = 'failed', error = 'Superseded by new grading request'
    WHERE submission_id = ? AND status IN ('pending', 'running')
  `,
    ).run(submission.id);

    // สร้าง job ใหม่
    const result = db
      .prepare("INSERT INTO grading_jobs (submission_id) VALUES (?)")
      .run(submission.id);

    const jobId = result.lastInsertRowid;

    // รัน background (non-blocking) — ผ่าน queue จำกัด MAX_CONCURRENT jobs
    setImmediate(processNextPending);

    res.status(202).json({
      message: "Grading started",
      job_id: jobId,
      submission_id: submission.id,
    });
  },
);

// GET /api/jobs/:id/status — polling endpoint
router.get("/jobs/:id/status", authenticate, (req, res) => {
  const job = db
    .prepare("SELECT * FROM grading_jobs WHERE id = ?")
    .get(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });

  // ตรวจ ownership — student ดูได้เฉพาะงานตัวเอง, teacher ดูได้เฉพาะ course ของตัวเอง
  const jobSubmission = db
    .prepare("SELECT * FROM submissions WHERE id = ?")
    .get(job.submission_id);
  if (jobSubmission) {
    if (
      req.user.role === "student" &&
      Number(jobSubmission.student_id) !== Number(req.user.id)
    ) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (req.user.role === "teacher") {
      const owns = db
        .prepare(
          `SELECT c.id FROM courses c
           JOIN assignments a ON a.course_id = c.id
           WHERE a.id = ? AND c.teacher_id = ?`,
        )
        .get(jobSubmission.assignment_id, req.user.id);
      if (!owns) return res.status(403).json({ error: "Forbidden" });
    }
  }

  res.json({
    job_id: job.id,
    submission_id: job.submission_id,
    status: job.status, // pending | running | done | failed
    error: job.error || null,
    created_at: job.created_at,
    updated_at: job.updated_at,
  });
});

// GET /api/submissions/:id/grades — ดูผลการตรวจ
router.get("/submissions/:id/grades", authenticate, (req, res) => {
  const submission = db
    .prepare("SELECT * FROM submissions WHERE id = ?")
    .get(req.params.id);
  if (!submission)
    return res.status(404).json({ error: "Submission not found" });

  // student ดูได้เฉพาะงานตัวเอง, teacher ดูได้เฉพาะ course ของตัวเอง
  if (
    req.user.role === "student" &&
    Number(submission.student_id) !== Number(req.user.id)
  ) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (req.user.role === "teacher") {
    const owns = db
      .prepare(
        `
      SELECT c.id FROM courses c
      JOIN assignments a ON a.course_id = c.id
      WHERE a.id = ? AND c.teacher_id = ?
    `,
      )
      .get(submission.assignment_id, req.user.id);
    if (!owns) return res.status(403).json({ error: "Forbidden" });
  }

  const grades = db
    .prepare(
      `
    SELECT g.*,
      COALESCE(g.criteria_name, rc.name, oc.name) AS criteria_name,
      COALESCE(rc.order_index, oc.order_index, g.id) AS order_index,
      COALESCE(rc.max_score, oc.max_score, 4) AS max_score
    FROM grades g
    LEFT JOIN rubric_criteria rc ON rc.id = g.rubric_criteria_id
    LEFT JOIN assignment_override_criteria oc ON oc.id = g.override_criteria_id
    WHERE g.submission_id = ?
    ORDER BY COALESCE(rc.order_index, oc.order_index, g.id)
  `,
    )
    .all(submission.id);

  // avg level (1.0 - max_score)
  const avgLevel =
    grades.length > 0
      ? Math.round(
          (grades.reduce((sum, g) => sum + g.level, 0) / grades.length) * 100,
        ) / 100
      : null;
  const maxLevel =
    grades.length > 0 ? Math.max(...grades.map((g) => g.max_score ?? 4)) : 4;

  // ดูว่า approve แล้วหรือยัง
  const approval = db
    .prepare(
      `
    SELECT * FROM grade_approvals WHERE submission_id = ? ORDER BY approved_at DESC LIMIT 1
  `,
    )
    .get(submission.id);

  // Class average level
  const classAvgRaw = db
    .prepare(
      `
    SELECT ROUND(AVG(avg_level), 2) AS class_avg_level
    FROM (
      SELECT AVG(g.level) AS avg_level
      FROM grades g
      WHERE g.submission_id IN (
        SELECT id FROM submissions
        WHERE assignment_id = ? AND status IN ('graded', 'approved')
      )
      GROUP BY g.submission_id
    )
  `,
    )
    .get(submission.assignment_id);

  // ดู job ล่าสุด (ใช้สำหรับคำนวณลำดับคิว)
  const latestJob = db
    .prepare(
      `SELECT * FROM grading_jobs WHERE submission_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get(submission.id);

  const finalLevel =
    submission.status === "approved" ? (approval?.final_level ?? null) : null;
  const displayLevel = finalLevel != null ? finalLevel : avgLevel;

  // คำนวณลำดับคิว (เฉพาะตอน pending)
  let queuePosition = null;
  let queueTotal = null;
  if (submission.status === "pending" && latestJob?.status === "pending") {
    const pos = db
      .prepare(
        `
      SELECT COUNT(*) as cnt FROM grading_jobs
      WHERE status = 'pending' AND id <= ?
    `,
      )
      .get(latestJob.id);
    const total = db
      .prepare(
        `
      SELECT COUNT(*) as cnt FROM grading_jobs WHERE status = 'pending'
    `,
      )
      .get();
    const running = db
      .prepare(
        `
      SELECT COUNT(*) as cnt FROM grading_jobs WHERE status = 'running'
    `,
      )
      .get();
    queuePosition = pos.cnt + running.cnt;
    queueTotal = total.cnt + running.cnt;
  }

  res.json({
    submission_id: submission.id,
    status: submission.status,
    avg_level: avgLevel,
    display_level: displayLevel,
    max_level: maxLevel,
    approved: ["approved", "edited"].includes(approval?.action) || false,
    final_level: finalLevel,
    class_avg_level: classAvgRaw?.class_avg_level ?? null,
    queue_position: queuePosition,
    queue_total: queueTotal,
    grades,
  });
});

// GET /api/submissions/:id — ดู submission detail
router.get("/submissions/:id", authenticate, (req, res) => {
  const submission = db
    .prepare(
      `
    SELECT s.*, u.name AS student_name, u.username AS student_username,
           a.title AS assignment_title, a.rubric_id, a.course_id, a.id AS assignment_id
    FROM submissions s
    JOIN users u ON u.id = s.student_id
    JOIN assignments a ON a.id = s.assignment_id
    WHERE s.id = ?
  `,
    )
    .get(req.params.id);

  if (!submission)
    return res.status(404).json({ error: "Submission not found" });

  if (
    req.user.role === "student" &&
    Number(submission.student_id) !== Number(req.user.id)
  ) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (req.user.role === "teacher") {
    const owns = db
      .prepare(
        `
      SELECT c.id FROM courses c
      JOIN assignments a ON a.course_id = c.id
      WHERE a.id = ? AND c.teacher_id = ?
    `,
      )
      .get(submission.assignment_id, req.user.id);
    if (!owns) return res.status(403).json({ error: "Forbidden" });
  }

  // ดู job ล่าสุด
  const latestJob = db
    .prepare(
      `
    SELECT * FROM grading_jobs WHERE submission_id = ? ORDER BY created_at DESC LIMIT 1
  `,
    )
    .get(submission.id);

  res.json({ submission, latest_job: latestJob || null });
});

// GET /api/assignments/:id/submissions — teacher ดู submissions ทั้งหมดของงาน
router.get(
  "/assignments/:id/submissions",
  authenticate,
  requireRole("teacher"),
  (req, res) => {
    const assignment = db
      .prepare(
        `
    SELECT a.* FROM assignments a
    JOIN courses c ON c.id = a.course_id
    WHERE a.id = ? AND c.teacher_id = ?
  `,
      )
      .get(req.params.id, req.user.id);

    if (!assignment)
      return res.status(404).json({ error: "Assignment not found" });

    // ดึง submission ล่าสุดของแต่ละคน (1 row ต่อนิสิต)
    const submitted = db
      .prepare(
        `
    SELECT s.*, u.name AS student_name, u.username AS student_username,
           e.group_no,
           gj.status AS job_status,
           (SELECT ROUND(AVG(g.level), 2) FROM grades g WHERE g.submission_id = s.id) AS avg_level,
           (SELECT MAX(COALESCE(rc.max_score, oc.max_score, 4))
            FROM grades g
            LEFT JOIN rubric_criteria rc ON rc.id = g.rubric_criteria_id
            LEFT JOIN assignment_override_criteria oc ON oc.id = g.override_criteria_id
            WHERE g.submission_id = s.id) AS max_level,
           (SELECT ap.status FROM appeals ap WHERE ap.submission_id = s.id ORDER BY ap.created_at DESC LIMIT 1) AS appeal_status
    FROM submissions s
    JOIN users u ON u.id = s.student_id
    JOIN enrollments e ON e.student_id = s.student_id AND e.course_id = ?
    LEFT JOIN grading_jobs gj ON gj.id = (
      SELECT id FROM grading_jobs WHERE submission_id = s.id ORDER BY created_at DESC LIMIT 1
    )
    WHERE s.assignment_id = ? AND s.id = (
      SELECT id FROM submissions
      WHERE assignment_id = s.assignment_id AND student_id = s.student_id
      ORDER BY attempt DESC LIMIT 1
    )
    ORDER BY e.group_no ASC, u.username ASC
  `,
      )
      .all(assignment.course_id, assignment.id);

    // นิสิตที่ enroll แต่ยังไม่ส่งงานเลย
    const submittedIds = new Set(submitted.map((s) => s.student_id));
    const notSubmitted = db
      .prepare(
        `
    SELECT u.id AS student_id, u.name AS student_name, u.username AS student_username,
           e.group_no
    FROM enrollments e
    JOIN users u ON u.id = e.student_id
    WHERE e.course_id = ?
    ORDER BY e.group_no ASC, u.username ASC
  `,
      )
      .all(assignment.course_id)
      .filter((u) => !submittedIds.has(u.student_id));

    const notSubmittedRows = notSubmitted.map((u) => ({
      id: null,
      student_id: u.student_id,
      student_name: u.student_name,
      student_username: u.student_username,
      group_no: u.group_no,
      status: "not_submitted",
      attempt: 0,
      submitted_at: null,
      avg_level: null,
      job_status: null,
    }));

    res.json({ submissions: [...submitted, ...notSubmittedRows] });
  },
);

// GET /api/student/submissions — นักเรียนดู submissions ทั้งหมดของตัวเอง
router.get(
  "/student/submissions",
  authenticate,
  requireRole("student"),
  (req, res) => {
    const submissions = db
      .prepare(
        `
    SELECT s.*, a.title AS assignment_title, c.name AS course_name,
           (SELECT ROUND(AVG(g.level), 2) FROM grades g WHERE g.submission_id = s.id) AS avg_level,
           (SELECT MAX(COALESCE(rc.max_score, oc.max_score, 4))
            FROM grades g
            LEFT JOIN rubric_criteria rc ON rc.id = g.rubric_criteria_id
            LEFT JOIN assignment_override_criteria oc ON oc.id = g.override_criteria_id
            WHERE g.submission_id = s.id) AS max_level,
           (SELECT ga.final_level FROM grade_approvals ga
            WHERE ga.submission_id = s.id AND ga.action IN ('approved', 'edited')
            ORDER BY ga.id DESC LIMIT 1) AS final_level
    FROM submissions s
    JOIN assignments a ON a.id = s.assignment_id
    JOIN courses c ON c.id = a.course_id
    WHERE s.student_id = ?
    ORDER BY s.submitted_at DESC
  `,
      )
      .all(req.user.id);

    res.json({ submissions });
  },
);

// PUT /api/submissions/:id/approve — teacher approve/reject/แก้คะแนน
router.put(
  "/submissions/:id/approve",
  authenticate,
  requireRole("teacher"),
  (req, res) => {
    const submission = db
      .prepare(
        `
    SELECT s.* FROM submissions s
    JOIN assignments a ON a.id = s.assignment_id
    JOIN courses c ON c.id = a.course_id
    WHERE s.id = ? AND c.teacher_id = ?
  `,
      )
      .get(req.params.id, req.user.id);

    if (!submission)
      return res.status(404).json({ error: "Submission not found" });
    if (!["graded", "approved"].includes(submission.status)) {
      return res
        .status(400)
        .json({ error: "Submission must be graded before approval" });
    }

    const { action, note, final_level } = req.body;
    if (!["approved", "rejected", "edited"].includes(action)) {
      return res
        .status(400)
        .json({ error: "action must be approved, rejected, or edited" });
    }

    // บันทึก original_score (avg level ของ AI ก่อนแก้) เฉพาะตอน action = 'edited'
    let originalScore = null;
    if (action === "edited") {
      const levelRow = db
        .prepare(
          `SELECT AVG(g.level) AS avg_level FROM grades g WHERE g.submission_id = ?`,
        )
        .get(submission.id);
      originalScore = levelRow?.avg_level ?? null;
    }

    db.transaction(() => {
      db.prepare(
        `
      INSERT INTO grade_approvals (submission_id, teacher_id, action, note, final_level, original_score)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      ).run(
        submission.id,
        req.user.id,
        action,
        note || null,
        final_level ?? null,
        originalScore,
      );

      if (
        action === "edited" &&
        originalScore !== null &&
        final_level != null &&
        submission.content_text
      ) {
        db.prepare(
          `
        INSERT INTO correction_examples (assignment_id, submission_text, original_score, final_level, note)
        VALUES (?, ?, ?, ?, ?)
      `,
        ).run(
          submission.assignment_id,
          submission.content_text,
          originalScore,
          final_level,
          note || null,
        );
      }

      db.prepare("UPDATE submissions SET status = ? WHERE id = ?").run(
        action === "rejected" ? "graded" : "approved",
        submission.id,
      );
    })();

    res.json({ message: `Submission ${action}` });
  },
);

// POST /api/assignments/:id/bulk-approve — approve ทุก graded submission ในงานนี้ทีเดียว
router.post(
  "/assignments/:id/bulk-approve",
  authenticate,
  requireRole("teacher"),
  (req, res) => {
    const assignment = db
      .prepare(
        `
    SELECT a.* FROM assignments a
    JOIN courses c ON c.id = a.course_id
    WHERE a.id = ? AND c.teacher_id = ?
  `,
      )
      .get(req.params.id, req.user.id);
    if (!assignment)
      return res.status(404).json({ error: "Assignment not found" });

    const graded = db
      .prepare(
        `
    SELECT s.id FROM submissions s
    WHERE s.assignment_id = ? AND s.status = 'graded'
  `,
      )
      .all(assignment.id);

    const approveOne = db.transaction((submissionId) => {
      db.prepare(
        `
      INSERT INTO grade_approvals (submission_id, teacher_id, action, note, final_level)
      VALUES (?, ?, 'approved', NULL, NULL)
    `,
      ).run(submissionId, req.user.id);
      db.prepare("UPDATE submissions SET status = 'approved' WHERE id = ?").run(
        submissionId,
      );
    });

    for (const s of graded) {
      approveOne(s.id);
    }

    res.json({ approved_count: graded.length });
  },
);

// GET /api/submissions/:id/history — ประวัติการส่งงานทั้งหมดของ student ใน assignment เดียวกัน
router.get("/submissions/:id/history", authenticate, (req, res) => {
  const submission = db
    .prepare("SELECT * FROM submissions WHERE id = ?")
    .get(req.params.id);
  if (!submission)
    return res.status(404).json({ error: "Submission not found" });

  // student ดูได้เฉพาะงานตัวเอง
  if (
    req.user.role === "student" &&
    Number(submission.student_id) !== Number(req.user.id)
  ) {
    return res.status(403).json({ error: "Forbidden" });
  }
  // teacher ดูได้เฉพาะ course ของตัวเอง
  if (req.user.role === "teacher") {
    const owns = db
      .prepare(
        `
      SELECT c.id FROM courses c
      JOIN assignments a ON a.course_id = c.id
      WHERE a.id = ? AND c.teacher_id = ?
    `,
      )
      .get(submission.assignment_id, req.user.id);
    if (!owns) return res.status(403).json({ error: "Forbidden" });
  }

  const history = db
    .prepare(
      `
    SELECT s.id, s.attempt, s.status, s.submitted_at,
      (SELECT ROUND(AVG(g.level), 2) FROM grades g WHERE g.submission_id = s.id) AS avg_level,
      (SELECT MAX(COALESCE(rc.max_score, oc.max_score, 4))
       FROM grades g
       LEFT JOIN rubric_criteria rc ON rc.id = g.rubric_criteria_id
       LEFT JOIN assignment_override_criteria oc ON oc.id = g.override_criteria_id
       WHERE g.submission_id = s.id) AS max_level,
      (SELECT ga.final_level FROM grade_approvals ga
       WHERE ga.submission_id = s.id AND ga.action IN ('approved','edited')
       ORDER BY ga.id DESC LIMIT 1) AS final_level
    FROM submissions s
    WHERE s.assignment_id = ? AND s.student_id = ?
    ORDER BY s.attempt ASC
  `,
    )
    .all(submission.assignment_id, submission.student_id);

  res.json({ history, current_submission_id: submission.id });
});

// GET /api/submissions/:id/preview-prompt — ดู prompt ที่จะส่งให้ AI (teacher only)
router.get(
  "/submissions/:id/preview-prompt",
  authenticate,
  requireRole("teacher"),
  async (req, res) => {
    try {
      const submission = db
        .prepare(
          `
      SELECT s.* FROM submissions s
      JOIN assignments a ON a.id = s.assignment_id
      JOIN courses c ON c.id = a.course_id
      WHERE s.id = ? AND c.teacher_id = ?
    `,
        )
        .get(req.params.id, req.user.id);
      if (!submission)
        return res.status(404).json({ error: "Submission not found" });

      const result = await buildPreviewPrompt(submission.id, req.user.id);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },
);

// GET /api/submissions/:id/audit — ประวัติ approve/reject/edit (teacher only)
router.get(
  "/submissions/:id/audit",
  authenticate,
  requireRole("teacher"),
  (req, res) => {
    const submission = db
      .prepare(
        `
    SELECT s.* FROM submissions s
    JOIN assignments a ON a.id = s.assignment_id
    JOIN courses c ON c.id = a.course_id
    WHERE s.id = ? AND c.teacher_id = ?
  `,
      )
      .get(req.params.id, req.user.id);
    if (!submission)
      return res.status(404).json({ error: "Submission not found" });

    const audit = db
      .prepare(
        `
    SELECT ga.id, ga.action, ga.note, ga.final_level, ga.approved_at,
           u.name AS teacher_name
    FROM grade_approvals ga
    JOIN users u ON u.id = ga.teacher_id
    WHERE ga.submission_id = ?
    ORDER BY ga.approved_at ASC
  `,
      )
      .all(submission.id);

    res.json({ audit });
  },
);

// GET /api/submissions/:id/neighbors — prev/next submission ในงานเดียวกัน (teacher only)
router.get(
  "/submissions/:id/neighbors",
  authenticate,
  requireRole("teacher"),
  (req, res) => {
    const submission = db
      .prepare(
        `
    SELECT s.* FROM submissions s
    JOIN assignments a ON a.id = s.assignment_id
    JOIN courses c ON c.id = a.course_id
    WHERE s.id = ? AND c.teacher_id = ?
  `,
      )
      .get(req.params.id, req.user.id);
    if (!submission)
      return res.status(404).json({ error: "Submission not found" });

    // ดึง submissions ทั้งหมดในงานเดียวกัน เรียงตามชื่อนิสิต
    const all = db
      .prepare(
        `
    SELECT s.id, u.name AS student_name
    FROM submissions s
    JOIN users u ON u.id = s.student_id
    WHERE s.assignment_id = ?
    ORDER BY u.name ASC, s.id ASC
  `,
      )
      .all(submission.assignment_id);

    const idx = all.findIndex((s) => s.id === submission.id);
    const prev = idx > 0 ? all[idx - 1] : null;
    const next = idx < all.length - 1 ? all[idx + 1] : null;

    res.json({
      prev: prev ? { id: prev.id, student_name: prev.student_name } : null,
      next: next ? { id: next.id, student_name: next.student_name } : null,
      current_index: idx + 1,
      total: all.length,
    });
  },
);

// GET /api/submissions/:id/file — เสิร์ฟไฟล์ภาพของ submission (นักเรียนเจ้าของ หรือครูวิชานั้น)
router.get("/submissions/:id/file", authenticate, (req, res) => {
  const submission = db
    .prepare(
      `
    SELECT s.*, a.course_id FROM submissions s
    JOIN assignments a ON a.id = s.assignment_id
    WHERE s.id = ?
  `,
    )
    .get(req.params.id);
  if (!submission)
    return res.status(404).json({ error: "Submission not found" });

  if (
    req.user.role === "student" &&
    Number(submission.student_id) !== Number(req.user.id)
  ) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (req.user.role === "teacher") {
    const owns = db
      .prepare("SELECT id FROM courses WHERE id = ? AND teacher_id = ?")
      .get(submission.course_id, req.user.id);
    if (!owns) return res.status(403).json({ error: "Forbidden" });
  }

  if (!submission.file_path)
    return res.status(404).json({ error: "No file for this submission" });

  const filePath = join(__dirname, "../uploads", submission.file_path);
  if (!existsSync(filePath))
    return res.status(404).json({ error: "File not found" });

  res.sendFile(filePath);
});

// GET /api/submissions/:id/content — ดูเนื้อหางานที่นักเรียนส่ง (teacher only)
router.get(
  "/submissions/:id/content",
  authenticate,
  requireRole("teacher"),
  async (req, res) => {
    const submission = db
      .prepare(
        `
    SELECT s.* FROM submissions s
    JOIN assignments a ON a.id = s.assignment_id
    JOIN courses c ON c.id = a.course_id
    WHERE s.id = ? AND c.teacher_id = ?
  `,
      )
      .get(req.params.id, req.user.id);
    if (!submission)
      return res.status(404).json({ error: "Submission not found" });

    if (submission.content_text) {
      return res.json({ type: "text", content: submission.content_text });
    }

    if (submission.file_path) {
      const filePath = join(__dirname, "../uploads", submission.file_path);
      if (!existsSync(filePath))
        return res.status(404).json({ error: "File not found" });

      const ext = extname(submission.file_path).toLowerCase();
      try {
        if (ext === ".txt") {
          return res.json({
            type: "text",
            content: readFileSync(filePath, "utf-8"),
            ext,
          });
        }
        if (ext === ".pdf") {
          const data = await pdfParse(readFileSync(filePath));
          return res.json({ type: "text", content: data.text, ext });
        }
        if (ext === ".docx") {
          const result = await mammoth.extractRawText({
            buffer: readFileSync(filePath),
          });
          return res.json({ type: "text", content: result.value, ext });
        }
        if (ext === ".png") {
          return res.json({
            type: "image",
            url: `/api/submissions/${submission.id}/file`,
            ext,
          });
        }
        return res.status(415).json({
          error: `Unsupported file type: ${ext}`,
        });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    res.json({ type: "empty" });
  },
);

// DELETE /api/submissions/:id/content — ลบ content_text + ไฟล์ แต่คง grade/feedback ไว้ (Data Minimization)
router.delete(
  "/submissions/:id/content",
  authenticate,
  requireRole("teacher", "admin"),
  async (req, res) => {
    const submission = db
      .prepare(
        `
    SELECT s.* FROM submissions s
    JOIN assignments a ON a.id = s.assignment_id
    JOIN courses c ON c.id = a.course_id
    WHERE s.id = ? AND (c.teacher_id = ? OR ? = 'admin')
  `,
      )
      .get(req.params.id, req.user.id, req.user.role);
    if (!submission)
      return res.status(404).json({ error: "Submission not found" });

    if (submission.status !== "approved") {
      return res
        .status(400)
        .json({ error: "ลบ content ได้เฉพาะงานที่ approved แล้ว" });
    }

    db.prepare(
      "UPDATE submissions SET content_text = NULL, file_path = NULL WHERE id = ?",
    ).run(submission.id);

    if (submission.file_path) {
      try {
        await unlink(join(__dirname, "../uploads", submission.file_path));
      } catch {
        /* ไม่มีไฟล์แล้ว */
      }
    }

    res.json({ message: "Content purged — grade and feedback retained" });
  },
);

// ─── Assignment Grading Settings (per-assignment override) ───────────────────

// GET /api/assignments/:id/grading-settings
router.get(
  "/assignments/:id/grading-settings",
  authenticate,
  requireRole("teacher"),
  (req, res) => {
    const assignment = db
      .prepare(
        `
    SELECT a.* FROM assignments a
    JOIN courses c ON c.id = a.course_id
    WHERE a.id = ? AND c.teacher_id = ?
  `,
      )
      .get(req.params.id, req.user.id);

    if (!assignment)
      return res.status(404).json({ error: "Assignment not found" });

    const settings = db
      .prepare(
        `
    SELECT * FROM assignment_grading_settings WHERE assignment_id = ?
  `,
      )
      .get(req.params.id);

    res.json({
      assignment_id: req.params.id,
      settings: settings || {
        ollama_temperature: null,
        ollama_top_p: null,
        ollama_repeat_penalty: null,
        ollama_num_predict: null,
        ollama_seed: null,
      },
    });
  },
);

// PUT /api/assignments/:id/grading-settings — create or update
router.put(
  "/assignments/:id/grading-settings",
  authenticate,
  requireRole("teacher"),
  (req, res) => {
    const assignment = db
      .prepare(
        `
    SELECT a.* FROM assignments a
    JOIN courses c ON c.id = a.course_id
    WHERE a.id = ? AND c.teacher_id = ?
  `,
      )
      .get(req.params.id, req.user.id);

    if (!assignment)
      return res.status(404).json({ error: "Assignment not found" });

    const {
      ollama_temperature,
      ollama_top_p,
      ollama_repeat_penalty,
      ollama_num_predict,
      ollama_seed,
    } = req.body;

    // Validate values
    if (
      ollama_temperature !== null &&
      (typeof ollama_temperature !== "number" ||
        ollama_temperature < 0 ||
        ollama_temperature > 2)
    ) {
      return res
        .status(400)
        .json({ error: "ollama_temperature must be between 0 and 2" });
    }
    if (
      ollama_top_p !== null &&
      (typeof ollama_top_p !== "number" || ollama_top_p < 0 || ollama_top_p > 1)
    ) {
      return res
        .status(400)
        .json({ error: "ollama_top_p must be between 0 and 1" });
    }
    if (
      ollama_repeat_penalty !== null &&
      (typeof ollama_repeat_penalty !== "number" || ollama_repeat_penalty < 0)
    ) {
      return res
        .status(400)
        .json({ error: "ollama_repeat_penalty must be >= 0" });
    }
    if (
      ollama_num_predict !== null &&
      (typeof ollama_num_predict !== "number" || ollama_num_predict < 1)
    ) {
      return res.status(400).json({ error: "ollama_num_predict must be >= 1" });
    }
    if (
      ollama_seed !== null &&
      (typeof ollama_seed !== "number" || ollama_seed < 0)
    ) {
      return res.status(400).json({ error: "ollama_seed must be >= 0" });
    }

    db.prepare(
      `INSERT INTO assignment_grading_settings
       (assignment_id, ollama_temperature, ollama_top_p, ollama_repeat_penalty, ollama_num_predict, ollama_seed)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(assignment_id) DO UPDATE SET
         ollama_temperature = excluded.ollama_temperature,
         ollama_top_p = excluded.ollama_top_p,
         ollama_repeat_penalty = excluded.ollama_repeat_penalty,
         ollama_num_predict = excluded.ollama_num_predict,
         ollama_seed = excluded.ollama_seed,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    ).run(
      req.params.id,
      ollama_temperature,
      ollama_top_p,
      ollama_repeat_penalty,
      ollama_num_predict,
      ollama_seed,
    );

    const updated = db
      .prepare(
        "SELECT * FROM assignment_grading_settings WHERE assignment_id = ?",
      )
      .get(req.params.id);

    res.json({
      message: "Assignment grading settings saved",
      settings: updated,
    });
  },
);

// DELETE /api/assignments/:id/grading-settings
router.delete(
  "/assignments/:id/grading-settings",
  authenticate,
  requireRole("teacher"),
  (req, res) => {
    const assignment = db
      .prepare(
        `
    SELECT a.* FROM assignments a
    JOIN courses c ON c.id = a.course_id
    WHERE a.id = ? AND c.teacher_id = ?
  `,
      )
      .get(req.params.id, req.user.id);

    if (!assignment)
      return res.status(404).json({ error: "Assignment not found" });

    const result = db
      .prepare(
        "DELETE FROM assignment_grading_settings WHERE assignment_id = ?",
      )
      .run(req.params.id);

    if (result.changes === 0) {
      return res
        .status(404)
        .json({ error: "Assignment grading settings not found" });
    }

    res.json({ message: "Assignment grading settings deleted" });
  },
);

export default router;
