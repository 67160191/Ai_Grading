import { Router } from "express";
import db from "../db/database.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { logActivity } from "../middleware/logger.js";

const router = Router();

// POST /api/submissions/:id/appeal — student ส่ง appeal
router.post(
  "/submissions/:id/appeal",
  authenticate,
  requireRole("student"),
  (req, res) => {
    const submission = db
      .prepare(
        `
    SELECT * FROM submissions WHERE id = ? AND student_id = ?
  `,
      )
      .get(req.params.id, req.user.id);

    if (!submission)
      return res.status(404).json({ error: "Submission not found" });
    if (!["graded", "approved"].includes(submission.status)) {
      return res
        .status(400)
        .json({ error: "ต้องรอผลตรวจก่อนจึงจะ appeal ได้" });
    }

    const { reason } = req.body;
    if (!reason?.trim())
      return res.status(400).json({ error: "กรุณาระบุเหตุผล" });

    // block ถ้ายังมี appeal ที่อาจารย์ยังไม่ปิด
    const existing = db
      .prepare(
        `
    SELECT id FROM appeals WHERE submission_id = ? AND status = 'pending'
  `,
      )
      .get(submission.id);
    if (existing)
      return res
        .status(400)
        .json({ error: "มี Appeal ที่อยู่ระหว่างพิจารณาอยู่แล้ว" });

    const result = db
      .prepare(
        `
    INSERT INTO appeals (submission_id, student_id, reason)
    VALUES (?, ?, ?)
  `,
      )
      .run(submission.id, req.user.id, reason.trim());

    logActivity({
      userId: req.user.id,
      action: "appeal_submit",
      entity: "appeal",
      entityId: result.lastInsertRowid,
      detail: { submission_id: submission.id },
      ip: req.ip,
    });

    res
      .status(201)
      .json({
        appeal_id: result.lastInsertRowid,
        message: "ส่ง Appeal สำเร็จ",
      });
  },
);

// GET /api/submissions/:id/appeal — student/teacher ดู appeal ของ submission นี้
router.get("/submissions/:id/appeal", authenticate, (req, res) => {
  const submission = db
    .prepare("SELECT * FROM submissions WHERE id = ?")
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

  const appeal = db
    .prepare(
      `
    SELECT * FROM appeals WHERE submission_id = ? ORDER BY created_at DESC LIMIT 1
  `,
    )
    .get(submission.id);

  res.json({ appeal: appeal || null });
});

// GET /api/teacher/summary — สรุปภาพรวมทุกวิชาของอาจารย์
router.get(
  "/teacher/summary",
  authenticate,
  requireRole("teacher"),
  (req, res) => {
    // นับเฉพาะ submission ล่าสุดต่อคนต่องาน (เหมือน AssignmentDetailPage)
    const pending_grading = db
      .prepare(
        `
    SELECT COUNT(*) AS count FROM submissions s
    JOIN assignments a ON a.id = s.assignment_id
    JOIN courses c ON c.id = a.course_id
    WHERE c.teacher_id = ? AND c.archived = 0 AND s.status = 'submitted'
      AND s.id = (
        SELECT id FROM submissions
        WHERE assignment_id = s.assignment_id AND student_id = s.student_id
        ORDER BY attempt DESC LIMIT 1
      )
  `,
      )
      .get(req.user.id).count;

    const pending_approval = db
      .prepare(
        `
    SELECT COUNT(*) AS count FROM submissions s
    JOIN assignments a ON a.id = s.assignment_id
    JOIN courses c ON c.id = a.course_id
    WHERE c.teacher_id = ? AND c.archived = 0 AND s.status = 'graded'
      AND s.id = (
        SELECT id FROM submissions
        WHERE assignment_id = s.assignment_id AND student_id = s.student_id
        ORDER BY attempt DESC LIMIT 1
      )
  `,
      )
      .get(req.user.id).count;

    const pending_appeals = db
      .prepare(
        `
    SELECT COUNT(*) AS count FROM appeals ap
    JOIN submissions s ON s.id = ap.submission_id
    JOIN assignments a ON a.id = s.assignment_id
    JOIN courses c ON c.id = a.course_id
    WHERE c.teacher_id = ? AND c.archived = 0 AND ap.status = 'pending'
      AND s.id = (
        SELECT id FROM submissions
        WHERE assignment_id = s.assignment_id AND student_id = s.student_id
        ORDER BY attempt DESC LIMIT 1
      )
  `,
      )
      .get(req.user.id).count;

    const approval_breakdown = db
      .prepare(
        `
    SELECT a.id AS assignment_id, a.title AS assignment_title,
           c.name AS course_name, COUNT(*) AS count
    FROM submissions s
    JOIN assignments a ON a.id = s.assignment_id
    JOIN courses c ON c.id = a.course_id
    WHERE c.teacher_id = ? AND c.archived = 0 AND s.status = 'graded'
      AND s.id = (
        SELECT id FROM submissions
        WHERE assignment_id = s.assignment_id AND student_id = s.student_id
        ORDER BY attempt DESC LIMIT 1
      )
    GROUP BY a.id
    ORDER BY c.name, a.title
  `,
      )
      .all(req.user.id);

    res.json({
      pending_grading,
      pending_approval,
      pending_appeals,
      approval_breakdown,
    });
  },
);

// GET /api/appeals/count — teacher นับ pending appeals (สำหรับ badge)
router.get(
  "/appeals/count",
  authenticate,
  requireRole("teacher"),
  (req, res) => {
    const row = db
      .prepare(
        `
    SELECT COUNT(*) AS count FROM appeals ap
    JOIN submissions s ON s.id = ap.submission_id
    JOIN assignments a ON a.id = s.assignment_id
    JOIN courses c ON c.id = a.course_id
    WHERE c.teacher_id = ? AND ap.status = 'pending'
  `,
      )
      .get(req.user.id);

    res.json({ count: row.count });
  },
);

// GET /api/assignments/:id/appeals — teacher ดู appeals ของ assignment นี้
router.get(
  "/assignments/:id/appeals",
  authenticate,
  requireRole("teacher"),
  (req, res) => {
    const appeals = db
      .prepare(
        `
    SELECT ap.submission_id FROM appeals ap
    JOIN submissions s ON s.id = ap.submission_id
    JOIN assignments a ON a.id = s.assignment_id
    JOIN courses c ON c.id = a.course_id
    WHERE a.id = ? AND c.teacher_id = ? AND ap.status = 'pending'
  `,
      )
      .all(req.params.id, req.user.id);

    const submissionIds = new Set(appeals.map((a) => a.submission_id));
    res.json({ pending_submission_ids: [...submissionIds] });
  },
);

// GET /api/appeals — teacher ดู appeals ทั้งหมดในวิชาของตัวเอง
router.get("/appeals", authenticate, requireRole("teacher"), (req, res) => {
  const appeals = db
    .prepare(
      `
    SELECT ap.*, u.name AS student_name, u.username AS student_username,
           s.assignment_id, a.title AS assignment_title, c.name AS course_name
    FROM appeals ap
    JOIN users u ON u.id = ap.student_id
    JOIN submissions s ON s.id = ap.submission_id
    JOIN assignments a ON a.id = s.assignment_id
    JOIN courses c ON c.id = a.course_id
    WHERE c.teacher_id = ?
    ORDER BY ap.created_at DESC
  `,
    )
    .all(req.user.id);

  res.json({ appeals });
});

// PUT /api/appeals/:id — teacher ตอบกลับ appeal
router.put("/appeals/:id", authenticate, requireRole("teacher"), (req, res) => {
  const appeal = db
    .prepare(
      `
    SELECT ap.* FROM appeals ap
    JOIN submissions s ON s.id = ap.submission_id
    JOIN assignments a ON a.id = s.assignment_id
    JOIN courses c ON c.id = a.course_id
    WHERE ap.id = ? AND c.teacher_id = ?
  `,
    )
    .get(req.params.id, req.user.id);

  if (!appeal) return res.status(404).json({ error: "Appeal not found" });

  const { teacher_response, status } = req.body;
  if (status !== "resolved") {
    return res.status(400).json({ error: "status must be resolved" });
  }
  if (!teacher_response?.trim())
    return res.status(400).json({ error: "กรุณาระบุ teacher_response" });

  db.prepare(
    `
    UPDATE appeals SET status = ?, teacher_response = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ?
  `,
  ).run(status, teacher_response.trim(), appeal.id);

  logActivity({
    userId: req.user.id,
    action: "appeal_resolve",
    entity: "appeal",
    entityId: appeal.id,
    detail: { submission_id: appeal.submission_id },
    ip: req.ip,
  });

  res.json({ message: "อัปเดต Appeal สำเร็จ" });
});

export default router;
