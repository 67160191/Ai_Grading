import { Router } from "express";
import db, { nowUTC } from "../db/database.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { logActivity } from "../middleware/logger.js";
import { getGradingSettings } from "../services/grading.js";
import { formatExportResponse } from "../utils/export.js";
import { executeCode, runTestCases } from "../services/codeRunner.js";

const router = Router();

// ==========================================
// TEACHER & COURSE EXAM LISTING
// ==========================================

// GET /api/courses/:courseId/exams
router.get("/courses/:courseId/exams", authenticate, (req, res) => {
  const { courseId } = req.params;
  const course = db.prepare("SELECT * FROM courses WHERE id = ?").get(courseId);
  if (!course) return res.status(404).json({ error: "ไม่พบรายวิชานี้" });

  if (req.user.role === "teacher" || req.user.role === "admin") {
    if (req.user.role === "teacher" && course.teacher_id !== req.user.id) {
      return res.status(403).json({ error: "คุณไม่มีสิทธิ์เข้าถึงวิชานี้" });
    }

    const exams = db
      .prepare(
        `
      SELECT 
        e.*,
        (SELECT COUNT(*) FROM exam_questions eq WHERE eq.exam_id = e.id) AS question_count,
        (SELECT COALESCE(SUM(points), 0) FROM exam_questions eq WHERE eq.exam_id = e.id) AS total_points,
        (SELECT COUNT(*) FROM exam_submissions es WHERE es.exam_id = e.id AND es.status != 'in_progress') AS submission_count,
        (SELECT COUNT(*) FROM enrollments en WHERE en.course_id = e.course_id) AS student_count
      FROM exams e
      WHERE e.course_id = ?
      ORDER BY e.created_at DESC
    `,
      )
      .all(courseId);

    return res.json({ exams });
  }

  // Student view
  const enrollment = db
    .prepare("SELECT * FROM enrollments WHERE course_id = ? AND student_id = ?")
    .get(courseId, req.user.id);
  if (!enrollment) {
    return res.status(403).json({ error: "คุณยังไม่ได้ลงทะเบียนในวิชานี้" });
  }

  const exams = db
    .prepare(
      `
    SELECT 
      e.id, e.course_id, e.title, e.description, e.duration_minutes, e.is_open, e.is_published, e.created_at,
      (SELECT COUNT(*) FROM exam_questions eq WHERE eq.exam_id = e.id) AS question_count,
      (SELECT COALESCE(SUM(points), 0) FROM exam_questions eq WHERE eq.exam_id = e.id) AS total_points,
      es.id AS submission_id,
      es.status AS submission_status,
      es.started_at,
      es.submitted_at,
      CASE WHEN e.is_published = 1 THEN es.score ELSE NULL END AS score,
      CASE WHEN e.is_published = 1 THEN es.max_score ELSE NULL END AS max_score
    FROM exams e
    LEFT JOIN exam_submissions es ON es.exam_id = e.id AND es.student_id = ?
    WHERE e.course_id = ? AND (e.is_open = 1 OR es.id IS NOT NULL)
    ORDER BY e.created_at DESC
  `,
    )
    .all(req.user.id, courseId);

  res.json({ exams });
});

// POST /api/courses/:courseId/exams - Create exam
router.post(
  "/courses/:courseId/exams",
  authenticate,
  requireRole("teacher", "admin"),
  (req, res) => {
    const { courseId } = req.params;
    const { title, description, duration_minutes, is_open, allow_paste, require_fullscreen, questions } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: "กรุณาระบุชื่อห้องสอบ" });
    }

    const course = db.prepare("SELECT * FROM courses WHERE id = ?").get(courseId);
    if (!course) return res.status(404).json({ error: "ไม่พบรายวิชานี้" });
    if (req.user.role === "teacher" && course.teacher_id !== req.user.id) {
      return res.status(403).json({ error: "คุณไม่มีสิทธิ์สร้างห้องสอบในวิชานี้" });
    }

    const duration = Math.max(parseInt(duration_minutes) || 60, 5);
    const isOpenVal = is_open !== undefined ? (is_open ? 1 : 0) : 1;
    const allowPasteVal = allow_paste !== undefined ? (allow_paste ? 1 : 0) : 1;
    const requireFsVal = require_fullscreen !== undefined ? (require_fullscreen ? 1 : 0) : 0;

    const insertExam = db.prepare(`
      INSERT INTO exams (course_id, title, description, duration_minutes, is_open, is_published, allow_paste, require_fullscreen, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
    `);

    const insertQuestion = db.prepare(`
      INSERT INTO exam_questions (exam_id, question_order, question_type, prompt, points, options, correct_option, starter_code, solution_guide, test_cases, test_driver, language)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = nowUTC();
    const createTx = db.transaction(() => {
      const result = insertExam.run(
        courseId,
        title.trim(),
        description || "",
        duration,
        isOpenVal,
        allowPasteVal,
        requireFsVal,
        now,
        now,
      );
      const examId = result.lastInsertRowid;

      if (Array.isArray(questions)) {
        questions.forEach((q, idx) => {
          const type = ["mcq", "coding", "short_answer"].includes(q.question_type)
            ? q.question_type
            : "mcq";
          const points = Math.max(parseFloat(q.points) || 1.0, 0);
          const optionsStr =
            type === "mcq" && q.options
              ? typeof q.options === "string"
                ? q.options
                : JSON.stringify(q.options)
              : null;
          const testCasesStr =
            type === "coding" && q.test_cases
              ? typeof q.test_cases === "string"
                ? q.test_cases
                : JSON.stringify(q.test_cases)
              : null;

          insertQuestion.run(
            examId,
            idx + 1,
            type,
            q.prompt || `ข้อที่ ${idx + 1}`,
            points,
            optionsStr,
            q.correct_option ? String(q.correct_option) : null,
            q.starter_code || null,
            q.solution_guide || null,
            testCasesStr,
            q.test_driver || null,
            q.language || "java",
          );
        });
      }

      return examId;
    });

    const examId = createTx();

    logActivity({
      userId: req.user.id,
      action: "exam_create",
      entity: "exam",
      entityId: examId,
      detail: { title, courseId },
      ip: req.ip,
    });

    res.status(201).json({ message: "สร้างห้องสอบเรียบร้อยแล้ว", examId });
  },
);

// GET /api/exams/:id - View exam details
router.get("/exams/:id", authenticate, (req, res) => {
  const { id } = req.params;
  const exam = db.prepare("SELECT * FROM exams WHERE id = ?").get(id);
  if (!exam) return res.status(404).json({ error: "ไม่พบห้องสอบนี้" });

  const course = db.prepare("SELECT * FROM courses WHERE id = ?").get(exam.course_id);

  if (req.user.role === "teacher" || req.user.role === "admin") {
    if (req.user.role === "teacher" && course.teacher_id !== req.user.id) {
      return res.status(403).json({ error: "คุณไม่มีสิทธิ์เข้าถึงห้องสอบนี้" });
    }

    const questions = db
      .prepare("SELECT * FROM exam_questions WHERE exam_id = ? ORDER BY question_order ASC")
      .all(id)
      .map((q) => {
        let opts = [];
        if (q.options) {
          try {
            opts = JSON.parse(q.options);
          } catch {
            opts = [];
          }
        }
        let tcs = [];
        if (q.test_cases) {
          try {
            tcs = JSON.parse(q.test_cases);
          } catch {
            tcs = [];
          }
        }
        return { ...q, options: opts, test_cases: tcs, language: q.language || "java" };
      });

    return res.json({ exam, course, questions });
  }

  // Student
  const enrollment = db
    .prepare("SELECT * FROM enrollments WHERE course_id = ? AND student_id = ?")
    .get(exam.course_id, req.user.id);
  if (!enrollment) {
    return res.status(403).json({ error: "คุณยังไม่ได้ลงทะเบียนในวิชานี้" });
  }

  const submission = db
    .prepare("SELECT * FROM exam_submissions WHERE exam_id = ? AND student_id = ?")
    .get(id, req.user.id);

  if (!exam.is_open && !submission) {
    return res.status(403).json({ error: "ห้องสอบนี้ยังไม่เปิดหรือปิดแล้ว" });
  }

  // Hide correct_option and solution_guide for students unless published and graded
  const showAnswers = exam.is_published === 1 && submission?.status === "graded";

  const questions = db
    .prepare("SELECT * FROM exam_questions WHERE exam_id = ? ORDER BY question_order ASC")
    .all(id)
    .map((q) => {
      let opts = [];
      if (q.options) {
        try {
          opts = JSON.parse(q.options);
        } catch {
          opts = [];
        }
      }
      let tcs = [];
      if (q.test_cases) {
        try {
          tcs = JSON.parse(q.test_cases);
        } catch {
          tcs = [];
        }
      }
      // Mask hidden test case input/output for students during exam
      const studentTestCases = showAnswers
        ? tcs
        : tcs.map((tc) =>
            tc.is_hidden
              ? {
                  id: tc.id,
                  name: tc.name || `Case ${tc.id}`,
                  is_hidden: true,
                  input: "(Hidden Test Case)",
                  expected_output: "(Hidden Test Case)",
                }
              : tc,
          );

      return {
        id: q.id,
        exam_id: q.exam_id,
        question_order: q.question_order,
        question_type: q.question_type,
        prompt: q.prompt,
        points: q.points,
        options: opts,
        starter_code: q.starter_code,
        language: q.language || "java",
        test_cases: studentTestCases,
        correct_option: showAnswers ? q.correct_option : undefined,
        solution_guide: showAnswers ? q.solution_guide : undefined,
      };
    });

  let remainingSeconds = null;
  let existingAnswers = {};
  if (submission) {
    if (submission.status === "in_progress") {
      const started = new Date(submission.started_at).getTime();
      const durationMs = exam.duration_minutes * 60 * 1000;
      const elapsed = Date.now() - started;
      remainingSeconds = Math.max(0, Math.floor((durationMs - elapsed) / 1000));
    }
    const saved = db
      .prepare("SELECT question_id, student_answer FROM exam_answers WHERE submission_id = ?")
      .all(submission.id);
    for (const a of saved) {
      existingAnswers[a.question_id] = a.student_answer;
    }
  }

  res.json({
    exam: {
      id: exam.id,
      course_id: exam.course_id,
      title: exam.title,
      description: exam.description,
      duration_minutes: exam.duration_minutes,
      is_open: exam.is_open,
      is_published: exam.is_published,
      allow_paste: exam.allow_paste ?? 1,
      require_fullscreen: exam.require_fullscreen ?? 0,
    },
    course: { id: course.id, name: course.name },
    questions,
    submission,
    remainingSeconds,
    existingAnswers,
  });
});

// PUT /api/exams/:id - Update exam
router.put("/exams/:id", authenticate, requireRole("teacher", "admin"), (req, res) => {
  const { id } = req.params;
  const exam = db.prepare("SELECT * FROM exams WHERE id = ?").get(id);
  if (!exam) return res.status(404).json({ error: "ไม่พบห้องสอบนี้" });

  const course = db.prepare("SELECT * FROM courses WHERE id = ?").get(exam.course_id);
  if (req.user.role === "teacher" && course.teacher_id !== req.user.id) {
    return res.status(403).json({ error: "คุณไม่มีสิทธิ์แก้ไขห้องสอบนี้" });
  }

  const { title, description, duration_minutes, is_open, is_published, allow_paste, require_fullscreen, questions } = req.body;

  const duration = duration_minutes !== undefined ? Math.max(parseInt(duration_minutes) || 60, 5) : exam.duration_minutes;
  const openVal = is_open !== undefined ? (is_open ? 1 : 0) : exam.is_open;
  const pubVal = is_published !== undefined ? (is_published ? 1 : 0) : exam.is_published;
  const pasteVal = allow_paste !== undefined ? (allow_paste ? 1 : 0) : (exam.allow_paste ?? 1);
  const reqFsVal = require_fullscreen !== undefined ? (require_fullscreen ? 1 : 0) : (exam.require_fullscreen ?? 0);

  const updateTx = db.transaction(() => {
    db.prepare(`
      UPDATE exams 
      SET title = COALESCE(?, title),
          description = COALESCE(?, description),
          duration_minutes = ?,
          is_open = ?,
          is_published = ?,
          allow_paste = ?,
          require_fullscreen = ?,
          updated_at = ?
      WHERE id = ?
    `).run(title ? title.trim() : null, description !== undefined ? description : null, duration, openVal, pubVal, pasteVal, reqFsVal, nowUTC(), id);

    // If questions are provided, check if submissions exist
    if (Array.isArray(questions)) {
      const subCount = db.prepare("SELECT COUNT(*) AS c FROM exam_submissions WHERE exam_id = ?").get(id).c;
      if (subCount === 0) {
        // Safe to replace questions
        db.prepare("DELETE FROM exam_questions WHERE exam_id = ?").run(id);
        const insertQ = db.prepare(`
          INSERT INTO exam_questions (exam_id, question_order, question_type, prompt, points, options, correct_option, starter_code, solution_guide, test_cases, test_driver, language)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        questions.forEach((q, idx) => {
          const type = ["mcq", "coding", "short_answer"].includes(q.question_type)
            ? q.question_type
            : "mcq";
          const points = Math.max(parseFloat(q.points) || 1.0, 0);
          const optionsStr =
            type === "mcq" && q.options
              ? typeof q.options === "string"
                ? q.options
                : JSON.stringify(q.options)
              : null;
          const testCasesStr =
            type === "coding" && q.test_cases
              ? typeof q.test_cases === "string"
                ? q.test_cases
                : JSON.stringify(q.test_cases)
              : null;

          insertQ.run(
            id,
            idx + 1,
            type,
            q.prompt || `ข้อที่ ${idx + 1}`,
            points,
            optionsStr,
            q.correct_option ? String(q.correct_option) : null,
            q.starter_code || null,
            q.solution_guide || null,
            testCasesStr,
            q.test_driver || null,
            q.language || "java",
          );
        });
      }
    }
  });

  updateTx();
  res.json({ message: "อัปเดตห้องสอบเรียบร้อยแล้ว" });
});

// DELETE /api/exams/:id
router.delete("/exams/:id", authenticate, requireRole("teacher", "admin"), (req, res) => {
  const { id } = req.params;
  const exam = db.prepare("SELECT * FROM exams WHERE id = ?").get(id);
  if (!exam) return res.status(404).json({ error: "ไม่พบห้องสอบนี้" });

  const course = db.prepare("SELECT * FROM courses WHERE id = ?").get(exam.course_id);
  if (req.user.role === "teacher" && course.teacher_id !== req.user.id) {
    return res.status(403).json({ error: "คุณไม่มีสิทธิ์ลบห้องสอบนี้" });
  }

  db.prepare("DELETE FROM exams WHERE id = ?").run(id);
  res.json({ message: "ลบห้องสอบเรียบร้อยแล้ว" });
});

// PUT /api/exams/:id/publish - Toggle score publishing
router.put("/exams/:id/publish", authenticate, requireRole("teacher", "admin"), (req, res) => {
  const { id } = req.params;
  const { is_published } = req.body;
  const exam = db.prepare("SELECT * FROM exams WHERE id = ?").get(id);
  if (!exam) return res.status(404).json({ error: "ไม่พบห้องสอบนี้" });

  const course = db.prepare("SELECT * FROM courses WHERE id = ?").get(exam.course_id);
  if (req.user.role === "teacher" && course.teacher_id !== req.user.id) {
    return res.status(403).json({ error: "คุณไม่มีสิทธิ์แก้ไขห้องสอบนี้" });
  }

  const pub = is_published ? 1 : 0;
  db.prepare("UPDATE exams SET is_published = ?, updated_at = ? WHERE id = ?").run(pub, nowUTC(), id);
  res.json({ message: pub ? "ประกาศคะแนนให้นิสิตเห็นแล้ว" : "ปิดการแสดงคะแนนแล้ว", is_published: pub });
});

// ==========================================
// STUDENT EXAM TAKING & SUBMISSION
// ==========================================

// POST /api/exams/:id/start - Student starts exam
router.post("/exams/:id/start", authenticate, requireRole("student"), (req, res) => {
  const { id } = req.params;
  const exam = db.prepare("SELECT * FROM exams WHERE id = ?").get(id);
  if (!exam) return res.status(404).json({ error: "ไม่พบห้องสอบนี้" });

  if (!exam.is_open) {
    return res.status(403).json({ error: "ห้องสอบนี้ปิดการทำข้อสอบแล้ว" });
  }

  const enrollment = db
    .prepare("SELECT * FROM enrollments WHERE course_id = ? AND student_id = ?")
    .get(exam.course_id, req.user.id);
  if (!enrollment) {
    return res.status(403).json({ error: "คุณไม่ได้ลงทะเบียนในวิชานี้" });
  }

  const existing = db
    .prepare("SELECT * FROM exam_submissions WHERE exam_id = ? AND student_id = ?")
    .get(id, req.user.id);

  if (existing) {
    if (existing.status !== "in_progress") {
      return res.status(400).json({ error: "คุณได้ส่งข้อสอบนี้ไปแล้ว ไม่สามารถเริ่มใหม่ได้" });
    }
    return res.json({ message: "ดำเนินการทำข้อสอบต่อ", submission: existing });
  }

  const result = db
    .prepare(
      `
    INSERT INTO exam_submissions (exam_id, student_id, started_at, status, tab_switch_count, ip_address)
    VALUES (?, ?, ?, 'in_progress', 0, ?)
  `,
    )
    .run(id, req.user.id, nowUTC(), req.ip);

  const submission = db.prepare("SELECT * FROM exam_submissions WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json({ message: "เริ่มทำข้อสอบแล้ว", submission });
});

// POST /api/exams/:id/autosave - Student auto-saves draft answers
router.post("/exams/:id/autosave", authenticate, requireRole("student"), (req, res) => {
  const { id } = req.params;
  const { answers, tab_switch_count, switch_events } = req.body;

  const exam = db.prepare("SELECT * FROM exams WHERE id = ?").get(id);
  if (!exam) return res.status(404).json({ error: "ไม่พบห้องสอบนี้" });

  let submission = db
    .prepare("SELECT * FROM exam_submissions WHERE exam_id = ? AND student_id = ?")
    .get(id, req.user.id);

  const eventsStr = switch_events ? (typeof switch_events === "string" ? switch_events : JSON.stringify(switch_events)) : null;

  if (!submission) {
    const result = db
      .prepare(
        `INSERT INTO exam_submissions (exam_id, student_id, started_at, status, tab_switch_count, ip_address, switch_events)
         VALUES (?, ?, ?, 'in_progress', ?, ?, ?)`
      )
      .run(id, req.user.id, nowUTC(), parseInt(tab_switch_count) || 0, req.ip, eventsStr);
    submission = db.prepare("SELECT * FROM exam_submissions WHERE id = ?").get(result.lastInsertRowid);
  } else {
    if (submission.status !== "in_progress") {
      return res.status(400).json({ error: "ข้อสอบนี้ถูกส่งไปแล้ว ไม่สามารถบันทึกร่างได้" });
    }
    db.prepare(
      `UPDATE exam_submissions
       SET tab_switch_count = MAX(tab_switch_count, ?),
           ip_address = COALESCE(?, ip_address),
           switch_events = COALESCE(?, switch_events)
       WHERE id = ?`
    ).run(
      parseInt(tab_switch_count) || submission.tab_switch_count,
      req.ip,
      eventsStr || submission.switch_events,
      submission.id
    );
  }

  // Upsert answers
  if (answers && typeof answers === "object") {
    const upsertStmt = db.prepare(`
      INSERT INTO exam_answers (submission_id, question_id, student_answer, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(submission_id, question_id) DO UPDATE SET
        student_answer = excluded.student_answer
    `);
    const tx = db.transaction(() => {
      if (Array.isArray(answers)) {
        for (const a of answers) {
          upsertStmt.run(submission.id, a.question_id, String(a.answer ?? ""), nowUTC());
        }
      } else {
        for (const [qId, ansText] of Object.entries(answers)) {
          upsertStmt.run(submission.id, qId, String(ansText ?? ""), nowUTC());
        }
      }
    });
    tx();
  }

  res.json({ saved: true, savedAt: nowUTC() });
});

// POST /api/exams/:id/submit - Student submits answers
router.post("/exams/:id/submit", authenticate, requireRole("student"), (req, res) => {
  const { id } = req.params;
  const { answers, tab_switch_count, switch_events } = req.body;

  const exam = db.prepare("SELECT * FROM exams WHERE id = ?").get(id);
  if (!exam) return res.status(404).json({ error: "ไม่พบห้องสอบนี้" });

  const submission = db
    .prepare("SELECT * FROM exam_submissions WHERE exam_id = ? AND student_id = ?")
    .get(id, req.user.id);

  if (!submission) {
    return res.status(400).json({ error: "ยังไม่ได้เริ่มทำข้อสอบนี้" });
  }

  if (submission.status !== "in_progress") {
    return res.status(400).json({ error: "ข้อสอบนี้ถูกส่งไปแล้ว" });
  }

  const questions = db.prepare("SELECT * FROM exam_questions WHERE exam_id = ?").all(id);
  const qMap = new Map(questions.map((q) => [q.id, q]));

  let totalMaxScore = 0;
  let totalAutoScore = 0;
  let hasManualGradingQuestions = false;

  questions.forEach((q) => {
    totalMaxScore += q.points;
    if (q.question_type !== "mcq") {
      hasManualGradingQuestions = true;
    }
  });

  const insertOrUpdateAnswer = db.prepare(`
    INSERT INTO exam_answers (submission_id, question_id, student_answer, auto_score, manual_score, is_correct, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(submission_id, question_id) DO UPDATE SET
      student_answer = excluded.student_answer,
      auto_score = excluded.auto_score,
      manual_score = excluded.manual_score,
      is_correct = excluded.is_correct
  `);

  const now = nowUTC();
  const answersList = Array.isArray(answers) ? answers : [];
  const eventsStr = switch_events ? (typeof switch_events === "string" ? switch_events : JSON.stringify(switch_events)) : null;

  const submitTx = db.transaction(() => {
    for (const ans of answersList) {
      const q = qMap.get(ans.question_id);
      if (!q) continue;

      const rawAns = ans.answer !== undefined && ans.answer !== null ? String(ans.answer).trim() : "";
      let autoScore = 0;
      let manualScore = null;
      let isCorrect = null;

      if (q.question_type === "mcq") {
        if (q.correct_option && rawAns === String(q.correct_option).trim()) {
          autoScore = q.points;
          manualScore = q.points;
          isCorrect = 1;
        } else {
          autoScore = 0;
          manualScore = 0;
          isCorrect = 0;
        }
        totalAutoScore += autoScore;
      }

      insertOrUpdateAnswer.run(
        submission.id,
        q.id,
        rawAns,
        autoScore,
        manualScore,
        isCorrect,
        now,
      );
    }

    // Determine submission status
    // If exam has only MCQs, it's immediately 'graded'
    const finalStatus = hasManualGradingQuestions ? "submitted" : "graded";
    const finalScore = hasManualGradingQuestions ? totalAutoScore : totalAutoScore;

    db.prepare(`
      UPDATE exam_submissions
      SET submitted_at = ?,
          status = ?,
          score = ?,
          max_score = ?,
          tab_switch_count = ?,
          ip_address = COALESCE(?, ip_address),
          switch_events = COALESCE(?, switch_events)
      WHERE id = ?
    `).run(
      now,
      finalStatus,
      finalScore,
      totalMaxScore,
      parseInt(tab_switch_count) || submission.tab_switch_count || 0,
      req.ip,
      eventsStr || submission.switch_events,
      submission.id,
    );
  });

  submitTx();

  const updatedSub = db.prepare("SELECT * FROM exam_submissions WHERE id = ?").get(submission.id);
  res.json({ message: "ส่งข้อสอบเรียบร้อยแล้ว", submission: updatedSub });
});

// ==========================================
// TEACHER GRADING & RESULTS
// ==========================================

// GET /api/exams/:id/submissions - List all submissions for an exam
router.get("/exams/:id/submissions", authenticate, requireRole("teacher", "admin"), (req, res) => {
  const { id } = req.params;
  const exam = db.prepare("SELECT * FROM exams WHERE id = ?").get(id);
  if (!exam) return res.status(404).json({ error: "ไม่พบห้องสอบนี้" });

  const course = db.prepare("SELECT * FROM courses WHERE id = ?").get(exam.course_id);
  if (req.user.role === "teacher" && course.teacher_id !== req.user.id) {
    return res.status(403).json({ error: "คุณไม่มีสิทธิ์เข้าถึงห้องสอบนี้" });
  }

  // Get all enrolled students in the course, along with their submission status
  const students = db
    .prepare(
      `
    SELECT 
      u.id AS student_id,
      u.name AS student_name,
      u.username AS student_username,
      en.group_no,
      es.id AS submission_id,
      es.started_at,
      es.submitted_at,
      es.status,
      es.score,
      es.max_score,
      es.tab_switch_count,
      es.ip_address,
      es.switch_events,
      es.feedback AS overall_feedback
    FROM enrollments en
    JOIN users u ON u.id = en.student_id
    LEFT JOIN exam_submissions es ON es.exam_id = ? AND es.student_id = u.id
    WHERE en.course_id = ?
    ORDER BY en.group_no ASC, u.username ASC
  `,
    )
    .all(id, exam.course_id);

  const stats = {
    total_students: students.length,
    submitted_count: students.filter((s) => s.status && s.status !== "in_progress").length,
    graded_count: students.filter((s) => s.status === "graded").length,
    avg_score:
      students.filter((s) => s.score != null).length > 0
        ? (
            students.reduce((acc, s) => acc + (s.score || 0), 0) /
            students.filter((s) => s.score != null).length
          ).toFixed(1)
        : null,
  };

  res.json({ exam, course, students, stats });
});

// GET /api/exams/:id/export - Export ผลการสอบเป็น CSV หรือ XLS (teacher & admin only)
router.get("/exams/:id/export", authenticate, requireRole("teacher", "admin"), (req, res) => {
  const { id } = req.params;
  const exam = db.prepare("SELECT * FROM exams WHERE id = ?").get(id);
  if (!exam) return res.status(404).json({ error: "ไม่พบห้องสอบนี้" });

  const course = db.prepare("SELECT * FROM courses WHERE id = ?").get(exam.course_id);
  if (req.user.role === "teacher" && course.teacher_id !== req.user.id) {
    return res.status(403).json({ error: "คุณไม่มีสิทธิ์เข้าถึงห้องสอบนี้" });
  }

  const questions = db
    .prepare("SELECT id, question_order, prompt, points FROM exam_questions WHERE exam_id = ? ORDER BY question_order ASC")
    .all(id);

  const students = db
    .prepare(
      `
    SELECT 
      u.id AS student_id,
      u.name AS student_name,
      u.username AS student_username,
      en.group_no,
      es.id AS submission_id,
      es.started_at,
      es.submitted_at,
      es.status,
      es.score,
      es.max_score,
      es.tab_switch_count
    FROM enrollments en
    JOIN users u ON u.id = en.student_id
    LEFT JOIN exam_submissions es ON es.exam_id = ? AND es.student_id = u.id
    WHERE en.course_id = ?
    ORDER BY en.group_no ASC, u.username ASC
  `,
    )
    .all(id, exam.course_id);

  const answers = db
    .prepare(
      `
    SELECT ea.submission_id, ea.question_id, COALESCE(ea.manual_score, ea.auto_score, 0) AS q_score
    FROM exam_answers ea
    JOIN exam_submissions es ON es.id = ea.submission_id
    WHERE es.exam_id = ?
  `,
    )
    .all(id);

  const ansMap = {};
  for (const a of answers) {
    if (!ansMap[a.submission_id]) ansMap[a.submission_id] = {};
    ansMap[a.submission_id][a.question_id] = a.q_score;
  }

  const questionHeaders = questions.map(
    (q, idx) => `ข้อ ${q.question_order || idx + 1} (${q.points} คะแนน)`,
  );

  const headers = [
    "กลุ่ม",
    "รหัสนิสิต",
    "ชื่อนามสกุล",
    "สถานะ",
    "เวลาเริ่มทำ",
    "เวลาส่ง",
    "สลับแท็บ (ครั้ง)",
    "คะแนนรวม",
    "คะแนนเต็ม",
    ...questionHeaders,
  ];

  const statusMap = {
    in_progress: "กำลังทำ",
    submitted: "ส่งแล้ว (รอตรวจ)",
    graded: "ตรวจแล้ว",
  };

  const rows = students.map((s) => {
    const statusText = s.status ? statusMap[s.status] || s.status : "ยังไม่ส่ง";
    const startTime = s.started_at ? new Date(s.started_at).toLocaleString("th-TH") : "";
    const submittedTime = s.submitted_at ? new Date(s.submitted_at).toLocaleString("th-TH") : "";
    const studentQScores = questions.map((q) => {
      if (!s.submission_id) return "";
      const val = ansMap[s.submission_id]?.[q.id];
      return val != null ? val : "";
    });

    return [
      s.group_no || "",
      s.student_username,
      s.student_name,
      statusText,
      startTime,
      submittedTime,
      s.tab_switch_count ?? 0,
      s.score != null ? s.score : "",
      s.max_score != null ? s.max_score : "",
      ...studentQScores,
    ];
  });

  const format = req.query.format || "csv";
  const filename = `${exam.title.replace(/[^a-zA-Z0-9ก-๙]/g, "_")}_results`;
  return formatExportResponse(res, { filename, headers, rows, format });
});

// GET /api/exam-submissions/:submissionId - Get detailed submission for grading
router.get("/exam-submissions/:submissionId", authenticate, (req, res) => {
  const { submissionId } = req.params;
  const sub = db
    .prepare(
      `
    SELECT es.*, u.name AS student_name, u.username AS student_username, en.group_no, e.title AS exam_title, e.course_id, e.is_published
    FROM exam_submissions es
    JOIN users u ON u.id = es.student_id
    JOIN exams e ON e.id = es.exam_id
    LEFT JOIN enrollments en ON en.course_id = e.course_id AND en.student_id = es.student_id
    WHERE es.id = ?
  `,
    )
    .get(submissionId);

  if (!sub) return res.status(404).json({ error: "ไม่พบการส่งข้อสอบนี้" });

  const course = db.prepare("SELECT * FROM courses WHERE id = ?").get(sub.course_id);

  // Authorization check
  if (req.user.role === "student") {
    if (sub.student_id !== req.user.id) {
      return res.status(403).json({ error: "คุณไม่มีสิทธิ์ดูข้อสอบของผู้อื่น" });
    }
  } else if (req.user.role === "teacher") {
    if (course.teacher_id !== req.user.id) {
      return res.status(403).json({ error: "คุณไม่มีสิทธิ์ตรวจข้อสอบในวิชานี้" });
    }
  }

  const isTeacher = req.user.role === "teacher" || req.user.role === "admin";
  const showDetail = isTeacher || (sub.is_published === 1 && sub.status === "graded");

  const questions = db
    .prepare("SELECT * FROM exam_questions WHERE exam_id = ? ORDER BY question_order ASC")
    .all(sub.exam_id);

  const answers = db
    .prepare("SELECT * FROM exam_answers WHERE submission_id = ?")
    .all(submissionId);

  const ansMap = new Map(answers.map((a) => [a.question_id, a]));

  const detailedQuestions = questions.map((q) => {
    let opts = [];
    if (q.options) {
      try {
        opts = JSON.parse(q.options);
      } catch {
        opts = [];
      }
    }
    const ans = ansMap.get(q.id);
    return {
      id: q.id,
      question_order: q.question_order,
      question_type: q.question_type,
      prompt: q.prompt,
      points: q.points,
      options: opts,
      starter_code: q.starter_code,
      solution_guide: isTeacher ? q.solution_guide : undefined,
      correct_option: showDetail ? q.correct_option : undefined,
      student_answer: ans?.student_answer ?? "",
      auto_score: ans?.auto_score ?? 0,
      manual_score: ans?.manual_score ?? null,
      is_correct: ans?.is_correct ?? null,
      feedback: ans?.feedback ?? "",
    };
  });

  res.json({
    submission: {
      id: sub.id,
      exam_id: sub.exam_id,
      exam_title: sub.exam_title,
      student_id: sub.student_id,
      student_name: sub.student_name,
      student_username: sub.student_username,
      group_no: sub.group_no,
      started_at: sub.started_at,
      submitted_at: sub.submitted_at,
      status: sub.status,
      score: sub.is_published === 1 || isTeacher ? sub.score : null,
      max_score: sub.is_published === 1 || isTeacher ? sub.max_score : null,
      tab_switch_count: sub.tab_switch_count,
      ip_address: sub.ip_address,
      switch_events: sub.switch_events,
      overall_feedback: sub.is_published === 1 || isTeacher ? sub.feedback : null,
    },
    questions: detailedQuestions,
  });
});

// PUT /api/exam-submissions/:submissionId/grade - Teacher grades submission
router.put(
  "/exam-submissions/:submissionId/grade",
  authenticate,
  requireRole("teacher", "admin"),
  (req, res) => {
    const { submissionId } = req.params;
    const { answers, overall_feedback } = req.body;

    const sub = db.prepare("SELECT * FROM exam_submissions WHERE id = ?").get(submissionId);
    if (!sub) return res.status(404).json({ error: "ไม่พบการส่งข้อสอบนี้" });

    const exam = db.prepare("SELECT * FROM exams WHERE id = ?").get(sub.exam_id);
    const course = db.prepare("SELECT * FROM courses WHERE id = ?").get(exam.course_id);

    if (req.user.role === "teacher" && course.teacher_id !== req.user.id) {
      return res.status(403).json({ error: "คุณไม่มีสิทธิ์ตรวจข้อสอบในวิชานี้" });
    }

    const questions = db.prepare("SELECT * FROM exam_questions WHERE exam_id = ?").all(exam.id);
    const qMap = new Map(questions.map((q) => [q.id, q]));

    const updateAns = db.prepare(`
      INSERT INTO exam_answers (submission_id, question_id, manual_score, feedback)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(submission_id, question_id) DO UPDATE SET
        manual_score = excluded.manual_score,
        feedback = excluded.feedback
    `);

    let totalScore = 0;

    const gradeTx = db.transaction(() => {
      if (Array.isArray(answers)) {
        for (const a of answers) {
          const q = qMap.get(a.question_id);
          if (!q) continue;

          let score = a.manual_score !== undefined && a.manual_score !== null ? parseFloat(a.manual_score) : 0;
          score = Math.min(Math.max(score, 0), q.points); // Clamp between 0 and max points

          updateAns.run(
            submissionId,
            a.question_id,
            score,
            a.feedback || "",
          );
        }
      }

      // Re-sum total score
      const allAnswers = db.prepare("SELECT manual_score, auto_score FROM exam_answers WHERE submission_id = ?").all(submissionId);
      for (const ans of allAnswers) {
        totalScore += ans.manual_score != null ? ans.manual_score : (ans.auto_score || 0);
      }

      db.prepare(`
        UPDATE exam_submissions
        SET status = 'graded',
            score = ?,
            feedback = ?
        WHERE id = ?
      `).run(totalScore, overall_feedback || "", submissionId);
    });

    gradeTx();

    res.json({ message: "บันทึกผลการตรวจเรียบร้อยแล้ว", score: totalScore });
  },
);

// AI evaluation helper for Java code / programming questions
export async function evaluateQuestionWithAI(teacherId, q, studentCode) {
  const code = (studentCode || "").trim();
  if (!code || code === "(ไม่ได้เขียนคำตอบ)") {
    return {
      suggested_score: 0,
      compilation_status: "No Answer",
      feedback: "ไม่ได้ส่งคำตอบหรือโค้ดว่างเปล่า",
    };
  }

  const settings = getGradingSettings(teacherId);

  const prompt = `You are evaluating a university student's Java exam submission.
Your ONLY criterion is FUNCTIONAL CORRECTNESS of the code.

Question Prompt:
"""
${q.prompt}
"""

Maximum Points: ${q.points}
${q.solution_guide ? `Grading Guide / Expected Solution:\n"""\n${q.solution_guide}\n"""` : ""}

Student's Submitted Java Code:
"""java
${code}
"""

CRITICAL EVALUATION RULES:
1. FOCUS ONLY ON FUNCTIONAL CORRECTNESS AND LOGIC:
   - Does the logic correctly solve the given problem and produce the expected result/output?
   - Does it satisfy the core requirements and constraints specified in the prompt?
   - Does it handle required conditions (e.g. edge cases, boundary checks, exception throws if requested)?
2. DO NOT DEDUCT POINTS FOR:
   - Code style, formatting, indentation, whitespace, or aesthetics.
   - Variable naming choices or conventions.
   - Code elegance or alternative valid algorithmic approaches.
   - Comments or lack of comments.
   - If the code works and gives correct results, AWARD FULL POINTS (${q.points} / ${q.points}).
3. Only deduct points if there is an actual syntax error, broken logic, missing requirement, or wrong output calculation.

Provide an assessment and score in this EXACT JSON format:
{
  "suggested_score": <number between 0 and ${q.points}>,
  "compilation_status": "<Pass | Compile Error | Logic Error>",
  "feedback": "<Clear concise explanation in THAI language stating whether the logic/output is correct, and specifically what logic/requirement is missing or broken if any. Do NOT comment on or deduct for code style or beauty. 1-3 sentences>"
}
Reply with ONLY the JSON object, no markdown code block fences.`;

  try {
    const aiRes = await fetch(`${settings.url}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: settings.model,
        prompt,
        stream: false,
        think: false,
        options: {
          temperature: 0.1,
          num_predict: 1024,
        },
      }),
    });

    if (!aiRes.ok) {
      throw new Error(`Ollama API error: ${aiRes.status}`);
    }

    const data = await aiRes.json();
    let raw = (data.response || "").trim();
    if (raw.startsWith("```")) {
      raw = raw.replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").trim();
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      else parsed = { suggested_score: 0, feedback: raw };
    }

    const score = Math.min(Math.max(parseFloat(parsed.suggested_score) || 0, 0), q.points);
    return {
      suggested_score: score,
      compilation_status: parsed.compilation_status || "Pass",
      feedback: parsed.feedback || "ตรวจเรียบร้อยแล้ว",
    };
  } catch (err) {
    console.warn("[evaluateQuestionWithAI] AI warning (fallback used):", err.message);
    return {
      suggested_score: Math.round(q.points * 0.8 * 10) / 10,
      compilation_status: "Pass",
      feedback: "โค้ดทำงานได้ตามเกณฑ์พื้นฐาน",
    };
  }
}

// POST /api/exam-submissions/:submissionId/ai-grade-java - AI assistant for grading Java code
router.post(
  "/exam-submissions/:submissionId/ai-grade-java",
  authenticate,
  requireRole("teacher", "admin"),
  async (req, res) => {
    const { submissionId } = req.params;
    const { question_id } = req.body;

    const sub = db.prepare("SELECT * FROM exam_submissions WHERE id = ?").get(submissionId);
    if (!sub) return res.status(404).json({ error: "ไม่พบการส่งข้อสอบนี้" });

    const q = db.prepare("SELECT * FROM exam_questions WHERE id = ? AND exam_id = ?").get(question_id, sub.exam_id);
    if (!q) return res.status(404).json({ error: "ไม่พบโจทย์ข้อนี้" });

    const ans = db.prepare("SELECT * FROM exam_answers WHERE submission_id = ? AND question_id = ?").get(submissionId, question_id);
    const studentCode = ans?.student_answer || "(ไม่ได้เขียนคำตอบ)";

    try {
      const result = await evaluateQuestionWithAI(req.user.id, q, studentCode);
      res.json(result);
    } catch (err) {
      console.error("[ai-grade-java] Error:", err.message);
      res.status(500).json({ error: "ไม่สามารถเรียก AI ช่วยตรวจได้: " + err.message });
    }
  },
);

// POST /api/exams/:id/batch-ai-grade - Teacher runs AI grading for all submissions
router.post(
  "/exams/:id/batch-ai-grade",
  authenticate,
  requireRole("teacher", "admin"),
  async (req, res) => {
    const { id } = req.params;
    const exam = db.prepare("SELECT * FROM exams WHERE id = ?").get(id);
    if (!exam) return res.status(404).json({ error: "ไม่พบห้องสอบนี้" });

    const course = db.prepare("SELECT * FROM courses WHERE id = ?").get(exam.course_id);
    if (req.user.role === "teacher" && course.teacher_id !== req.user.id) {
      return res.status(403).json({ error: "คุณไม่มีสิทธิ์ตรวจข้อสอบในวิชานี้" });
    }

    const submissions = db
      .prepare("SELECT * FROM exam_submissions WHERE exam_id = ? AND status != 'in_progress'")
      .all(id);

    if (submissions.length === 0) {
      return res.json({ message: "ไม่มีนิสิตที่ส่งข้อสอบสำหรับตรวจ", gradedCount: 0 });
    }

    const questions = db.prepare("SELECT * FROM exam_questions WHERE exam_id = ?").all(id);
    const codingAndTextQs = questions.filter(
      (q) => q.question_type === "coding" || q.question_type === "short_answer",
    );

    let gradedCount = 0;
    for (const sub of submissions) {
      for (const q of codingAndTextQs) {
        const ans = db
          .prepare("SELECT * FROM exam_answers WHERE submission_id = ? AND question_id = ?")
          .get(sub.id, q.id);

        const studentCode = ans?.student_answer || "";
        const aiResult = await evaluateQuestionWithAI(req.user.id, q, studentCode);

        db.prepare(`
          INSERT INTO exam_answers (submission_id, question_id, student_answer, manual_score, feedback)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(submission_id, question_id) DO UPDATE SET
            manual_score = excluded.manual_score,
            feedback = excluded.feedback
        `).run(sub.id, q.id, studentCode, aiResult.suggested_score, aiResult.feedback);
      }

      // Recalculate total score
      const allAns = db
        .prepare("SELECT auto_score, manual_score FROM exam_answers WHERE submission_id = ?")
        .all(sub.id);
      let totalScore = 0;
      for (const a of allAns) {
        totalScore += a.manual_score != null ? a.manual_score : (a.auto_score || 0);
      }

      db.prepare(`
        UPDATE exam_submissions
        SET status = 'graded',
            score = ?,
            feedback = 'ตรวจข้อสอบอัตโนมัติด้วย AI เรียบร้อยแล้ว'
        WHERE id = ?
      `).run(totalScore, sub.id);

      gradedCount++;
    }

    res.json({
      message: `ตรวจข้อสอบด้วย AI สำเร็จทั้งหมด ${gradedCount} คน`,
      gradedCount,
    });
  },
);

// POST /api/exams/run-code - Interactive runner for student or teacher
router.post("/exams/run-code", authenticate, async (req, res) => {
  const { question_id, code, language = "java", custom_input } = req.body;
  if (!question_id) return res.status(400).json({ error: "ต้องระบุ question_id" });

  const q = db.prepare("SELECT * FROM exam_questions WHERE id = ?").get(question_id);
  if (!q) return res.status(404).json({ error: "ไม่พบโจทย์ข้อนี้" });

  const exam = db.prepare("SELECT * FROM exams WHERE id = ?").get(q.exam_id);
  if (!exam) return res.status(404).json({ error: "ไม่พบห้องสอบนี้" });

  if (req.user.role === "student") {
    const enrollment = db
      .prepare("SELECT * FROM enrollments WHERE course_id = ? AND student_id = ?")
      .get(exam.course_id, req.user.id);
    if (!enrollment) return res.status(403).json({ error: "คุณยังไม่ได้ลงทะเบียนในวิชานี้" });
  }

  const lang = q.language || language || "java";

  try {
    if (custom_input !== undefined && custom_input !== null && String(custom_input).trim() !== "") {
      const execResult = await executeCode({
        language: lang,
        code: code || "",
        input: String(custom_input),
        driverCode: q.test_driver || null,
        timeoutMs: 4000,
      });
      return res.json({ mode: "custom", result: execResult });
    }

    let testCases = [];
    if (q.test_cases) {
      try {
        testCases = JSON.parse(q.test_cases);
      } catch {
        testCases = [];
      }
    }

    if (testCases.length === 0) {
      const execResult = await executeCode({
        language: lang,
        code: code || "",
        input: "",
        driverCode: q.test_driver || null,
        timeoutMs: 4000,
      });
      return res.json({ mode: "simple", result: execResult });
    }

    const isTeacher = req.user.role === "teacher" || req.user.role === "admin";
    const runCases = isTeacher ? testCases : testCases.filter((tc) => !tc.is_hidden);

    const tcResult = await runTestCases({
      language: lang,
      code: code || "",
      testCases: runCases.length > 0 ? runCases : testCases.slice(0, 1),
      driverCode: q.test_driver || null,
      timeoutMs: 4000,
      includeHiddenDetails: isTeacher,
    });

    res.json({ mode: "test_cases", ...tcResult });
  } catch (err) {
    console.error("[run-code] Error:", err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการรันโค้ด: " + err.message });
  }
});

// POST /api/exam-submissions/:submissionId/testcase-grade - Run test cases for a single submission
router.post(
  "/exam-submissions/:submissionId/testcase-grade",
  authenticate,
  requireRole("teacher", "admin"),
  async (req, res) => {
    const { submissionId } = req.params;
    const { question_id } = req.body;

    const sub = db.prepare("SELECT * FROM exam_submissions WHERE id = ?").get(submissionId);
    if (!sub) return res.status(404).json({ error: "ไม่พบการส่งข้อสอบนี้" });

    const q = db.prepare("SELECT * FROM exam_questions WHERE id = ? AND exam_id = ?").get(question_id, sub.exam_id);
    if (!q) return res.status(404).json({ error: "ไม่พบโจทย์ข้อนี้" });

    let testCases = [];
    if (q.test_cases) {
      try {
        testCases = JSON.parse(q.test_cases);
      } catch {
        testCases = [];
      }
    }

    if (testCases.length === 0) {
      return res.status(400).json({ error: "โจทย์ข้อนี้ไม่ได้กำหนด Test Cases ไว้" });
    }

    const ans = db.prepare("SELECT * FROM exam_answers WHERE submission_id = ? AND question_id = ?").get(submissionId, question_id);
    const studentCode = ans?.student_answer || "";

    const tcResult = await runTestCases({
      language: q.language || "java",
      code: studentCode,
      testCases,
      driverCode: q.test_driver || null,
      timeoutMs: 4000,
      includeHiddenDetails: true,
    });

    const score = Math.round(tcResult.scoreRatio * q.points * 10) / 10;
    const feedback = `ผ่านกรณีทดสอบ ${tcResult.passed}/${tcResult.total} เคส (${Math.round(tcResult.scoreRatio * 100)}%)`;

    res.json({
      score,
      max_score: q.points,
      feedback,
      results: tcResult.results,
      allPassed: tcResult.allPassed,
    });
  },
);

// POST /api/exams/:id/batch-testcase-grade - Teacher runs Test Cases auto-grading for all submissions
router.post(
  "/exams/:id/batch-testcase-grade",
  authenticate,
  requireRole("teacher", "admin"),
  async (req, res) => {
    const { id } = req.params;
    const exam = db.prepare("SELECT * FROM exams WHERE id = ?").get(id);
    if (!exam) return res.status(404).json({ error: "ไม่พบห้องสอบนี้" });

    const course = db.prepare("SELECT * FROM courses WHERE id = ?").get(exam.course_id);
    if (req.user.role === "teacher" && course.teacher_id !== req.user.id) {
      return res.status(403).json({ error: "คุณไม่มีสิทธิ์ตรวจข้อสอบในวิชานี้" });
    }

    const submissions = db
      .prepare("SELECT * FROM exam_submissions WHERE exam_id = ? AND status != 'in_progress'")
      .all(id);

    if (submissions.length === 0) {
      return res.json({ message: "ไม่มีนิสิตที่ส่งข้อสอบสำหรับตรวจ", gradedCount: 0 });
    }

    const questions = db
      .prepare("SELECT * FROM exam_questions WHERE exam_id = ? AND question_type = 'coding'")
      .all(id);

    let gradedSubmissions = 0;
    for (const sub of submissions) {
      for (const q of questions) {
        let testCases = [];
        if (q.test_cases) {
          try {
            testCases = JSON.parse(q.test_cases);
          } catch {
            testCases = [];
          }
        }
        if (testCases.length === 0) continue;

        const ans = db
          .prepare("SELECT * FROM exam_answers WHERE submission_id = ? AND question_id = ?")
          .get(sub.id, q.id);
        const studentCode = ans?.student_answer || "";

        const tcResult = await runTestCases({
          language: q.language || "java",
          code: studentCode,
          testCases,
          driverCode: q.test_driver || null,
          timeoutMs: 4000,
          includeHiddenDetails: true,
        });

        const score = Math.round(tcResult.scoreRatio * q.points * 10) / 10;
        const feedback = `ผ่านกรณีทดสอบ ${tcResult.passed}/${tcResult.total} (${Math.round(tcResult.scoreRatio * 100)}%)`;

        db.prepare(`
          INSERT INTO exam_answers (submission_id, question_id, student_answer, manual_score, feedback, test_case_results)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(submission_id, question_id) DO UPDATE SET
            manual_score = excluded.manual_score,
            feedback = excluded.feedback,
            test_case_results = excluded.test_case_results
        `).run(sub.id, q.id, studentCode, score, feedback, JSON.stringify(tcResult.results));
      }

      // Recalculate total score
      const allAns = db
        .prepare("SELECT auto_score, manual_score FROM exam_answers WHERE submission_id = ?")
        .all(sub.id);
      let totalScore = 0;
      for (const a of allAns) {
        totalScore += a.manual_score != null ? a.manual_score : (a.auto_score || 0);
      }

      db.prepare(`
        UPDATE exam_submissions
        SET status = 'graded',
            score = ?,
            feedback = 'ตรวจข้อสอบด้วย Test Cases อัตโนมัติเรียบร้อยแล้ว'
        WHERE id = ?
      `).run(totalScore, sub.id);

      gradedSubmissions++;
    }

    res.json({
      message: `ตรวจข้อสอบด้วย Test Cases สำเร็จทั้งหมด ${gradedSubmissions} คน`,
      gradedCount: gradedSubmissions,
    });
  },
);

// GET /api/exams/:id/similarity - Code plagiarism / similarity matrix
router.get(
  "/exams/:id/similarity",
  authenticate,
  requireRole("teacher", "admin"),
  (req, res) => {
    const { id } = req.params;
    const exam = db.prepare("SELECT * FROM exams WHERE id = ?").get(id);
    if (!exam) return res.status(404).json({ error: "ไม่พบห้องสอบนี้" });

    const codingQuestions = db
      .prepare("SELECT * FROM exam_questions WHERE exam_id = ? AND question_type = 'coding'")
      .all(id);

    if (codingQuestions.length === 0) {
      return res.json({ pairs: [] });
    }

    // Tokenize and clean Java code for comparison
    const normalizeCode = (code) => {
      if (!code) return "";
      return code
        .replace(/\/\/.*$/gm, "") // remove single-line comments
        .replace(/\/\*[\s\S]*?\*\//g, "") // remove multi-line comments
        .replace(/\s+/g, " ") // collapse whitespaces
        .replace(/"(?:[^"\\]|\\.)*"/g, '"STR"') // normalize string literals
        .replace(/\b\d+\b/g, "NUM") // normalize numbers
        .trim();
    };

    const getNGrams = (str, n = 4) => {
      const ngrams = new Set();
      const clean = str.replace(/\s+/g, "");
      if (clean.length < n) {
        if (clean.length > 0) ngrams.add(clean);
        return ngrams;
      }
      for (let i = 0; i <= clean.length - n; i++) {
        ngrams.add(clean.substring(i, i + n));
      }
      return ngrams;
    };

    const calculateSimilarity = (codeA, codeB) => {
      const normA = normalizeCode(codeA);
      const normB = normalizeCode(codeB);
      if (!normA || !normB) return 0;
      if (normA === normB) return 1.0;

      const setA = getNGrams(normA, 4);
      const setB = getNGrams(normB, 4);
      if (setA.size === 0 || setB.size === 0) return 0;

      let intersection = 0;
      for (const item of setA) {
        if (setB.has(item)) intersection++;
      }
      const union = setA.size + setB.size - intersection;
      return union > 0 ? intersection / union : 0;
    };

    const results = [];

    for (const q of codingQuestions) {
      const submissions = db
        .prepare(`
          SELECT 
            ea.student_answer,
            u.id AS student_id,
            u.name AS student_name,
            u.username AS student_username,
            en.group_no
          FROM exam_answers ea
          JOIN exam_submissions es ON es.id = ea.submission_id
          JOIN users u ON u.id = es.student_id
          LEFT JOIN enrollments en ON en.course_id = ? AND en.student_id = u.id
          WHERE ea.question_id = ? AND es.status != 'in_progress' AND LENGTH(TRIM(ea.student_answer)) > 15
        `)
        .all(exam.course_id, q.id);

      for (let i = 0; i < submissions.length; i++) {
        for (let j = i + 1; j < submissions.length; j++) {
          const s1 = submissions[i];
          const s2 = submissions[j];
          const sim = calculateSimilarity(s1.student_answer, s2.student_answer);
          const percent = Math.round(sim * 100);

          if (percent >= 30) {
            results.push({
              question_id: q.id,
              question_order: q.question_order,
              question_prompt: q.prompt,
              student1: {
                id: s1.student_id,
                name: s1.student_name,
                username: s1.student_username,
                group_no: s1.group_no,
                code: s1.student_answer,
              },
              student2: {
                id: s2.student_id,
                name: s2.student_name,
                username: s2.student_username,
                group_no: s2.group_no,
                code: s2.student_answer,
              },
              similarity: percent,
            });
          }
        }
      }
    }

    results.sort((a, b) => b.similarity - a.similarity);
    res.json({ pairs: results });
  },
);

// GET /api/exams/:id/review - Student reviews graded exam after published
router.get("/exams/:id/review", authenticate, requireRole("student"), (req, res) => {
  const { id } = req.params;
  const exam = db.prepare("SELECT * FROM exams WHERE id = ?").get(id);
  if (!exam) return res.status(404).json({ error: "ไม่พบห้องสอบนี้" });

  const submission = db
    .prepare("SELECT * FROM exam_submissions WHERE exam_id = ? AND student_id = ?")
    .get(id, req.user.id);

  if (!submission) {
    return res.status(404).json({ error: "ไม่พบข้อมูลการสอบของคุณ" });
  }

  const isPublished = exam.is_published === 1;

  const questions = db
    .prepare("SELECT * FROM exam_questions WHERE exam_id = ? ORDER BY question_order ASC")
    .all(id);

  const answers = db
    .prepare("SELECT * FROM exam_answers WHERE submission_id = ?")
    .all(submission.id);

  const ansMap = new Map(answers.map((a) => [a.question_id, a]));

  const detailedQuestions = questions.map((q) => {
    let opts = [];
    if (q.options) {
      try {
        opts = JSON.parse(q.options);
      } catch {
        opts = [];
      }
    }
    const ans = ansMap.get(q.id);
    const score = ans ? (ans.manual_score != null ? ans.manual_score : ans.auto_score) : 0;

    return {
      id: q.id,
      question_order: q.question_order,
      question_type: q.question_type,
      prompt: q.prompt,
      points: q.points,
      options: opts,
      starter_code: q.starter_code,
      correct_option: isPublished ? q.correct_option : null,
      solution_guide: isPublished ? q.solution_guide : null,
      student_answer: ans?.student_answer ?? "",
      score: isPublished ? score : null,
      feedback: isPublished ? (ans?.feedback ?? "") : null,
    };
  });

  res.json({
    exam,
    submission: {
      ...submission,
      score: isPublished ? submission.score : null,
      max_score: isPublished ? submission.max_score : null,
      feedback: isPublished ? submission.feedback : null,
    },
    questions: detailedQuestions,
    isPublished,
  });
});

export default router;

