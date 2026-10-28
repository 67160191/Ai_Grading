import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import db from '../db/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { logActivity } from '../middleware/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const router = Router();

// GET /api/admin/stats — ภาพรวมระบบ
router.get('/stats', authenticate, requireRole('admin'), (req, res) => {
  const teachers = db.prepare(`SELECT COUNT(*) AS count FROM users WHERE role = 'teacher'`).get().count;
  const students = db.prepare(`SELECT COUNT(*) AS count FROM users WHERE role = 'student'`).get().count;
  const courses = db.prepare(`SELECT COUNT(*) AS count FROM courses WHERE archived = 0`).get().count;
  const submissions = db.prepare(`SELECT COUNT(*) AS count FROM submissions`).get().count;
  const pendingGrading = db.prepare(`SELECT COUNT(*) AS count FROM submissions WHERE status = 'pending'`).get().count;
  const pendingApproval = db.prepare(`SELECT COUNT(*) AS count FROM submissions WHERE status = 'graded'`).get().count;
  res.json({ teachers, students, courses, submissions, pendingGrading, pendingApproval });
});

// GET /api/admin/users — รายชื่อ teacher ทั้งหมด
router.get('/users', authenticate, requireRole('admin'), (req, res) => {
  const teachers = db.prepare(`
    SELECT u.id, u.name, u.username, u.created_at,
           COUNT(DISTINCT c.id) AS course_count
    FROM users u
    LEFT JOIN courses c ON c.teacher_id = u.id
    WHERE u.role = 'teacher'
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `).all();
  res.json({ teachers });
});

// POST /api/admin/users — สร้าง teacher account
router.post('/users', authenticate, requireRole('admin'), (req, res) => {
  const { name, username, password } = req.body;
  if (!name || !username || !password) {
    return res.status(400).json({ error: 'name, username, password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: 'Username already taken' });

  const hashed = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (name, username, password, role) VALUES (?, ?, ?, ?)'
  ).run(name, username, hashed, 'teacher');

  logActivity({ userId: req.user.id, action: 'admin_create_teacher', entity: 'user', entityId: result.lastInsertRowid, detail: { username }, ip: req.ip });
  res.status(201).json({ teacher: { id: result.lastInsertRowid, name, username, role: 'teacher' } });
});

// PUT /api/admin/users/:id/reset-password — reset password teacher
router.put('/users/:id/reset-password', authenticate, requireRole('admin'), (req, res) => {
  const teacher = db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(req.params.id, 'teacher');
  if (!teacher) return res.status(404).json({ error: 'Teacher not found' });

  const { password } = req.body;
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' });
  }

  const hashed = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, teacher.id);
  logActivity({ userId: req.user.id, action: 'admin_reset_password', entity: 'user', entityId: teacher.id, detail: { username: teacher.username }, ip: req.ip });
  res.json({ message: 'Reset password สำเร็จ' });
});

// DELETE /api/admin/users/:id — ลบ teacher (cascade ลบวิชาและข้อมูลทั้งหมด)
router.delete('/users/:id', authenticate, requireRole('admin'), (req, res) => {
  const teacher = db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(req.params.id, 'teacher');
  if (!teacher) return res.status(404).json({ error: 'Teacher not found' });

  db.prepare('DELETE FROM users WHERE id = ?').run(teacher.id);
  logActivity({ userId: req.user.id, action: 'admin_delete_teacher', entity: 'user', entityId: teacher.id, detail: { username: teacher.username }, ip: req.ip });
  res.json({ message: 'ลบ teacher สำเร็จ' });
});

const GLOBAL_KEYS = ['ollama_url','ollama_url_backup','ollama_model','ollama_vision_model','ollama_temperature','ollama_top_p','ollama_repeat_penalty','ollama_num_predict','ollama_seed'];

// GET /api/admin/settings/grading
router.get('/settings/grading', authenticate, requireRole('admin'), (req, res) => {
  const rows = db.prepare('SELECT key, value FROM grading_settings WHERE teacher_id IS NULL ORDER BY id').all();
  res.json({ settings: Object.fromEntries(rows.map(r => [r.key, r.value])) });
});

// PUT /api/admin/settings/grading
router.put('/settings/grading', authenticate, requireRole('admin'), (req, res) => {
  const { settings } = req.body;
  if (!settings || typeof settings !== 'object') return res.status(400).json({ error: 'settings required' });
  // teacher_id เป็น NULL สำหรับ global settings — SQLite ไม่ถือ NULL=NULL เป็นค่าซ้ำ
  // ทำให้ ON CONFLICT(teacher_id, key) ไม่ทำงาน ต้อง DELETE ก่อน INSERT เอง
  const del = db.prepare('DELETE FROM grading_settings WHERE teacher_id IS NULL AND key = ?');
  const insert = db.prepare('INSERT INTO grading_settings (teacher_id, key, value) VALUES (NULL, ?, ?)');
  db.transaction(() => {
    for (const [k, v] of Object.entries(settings)) {
      if (!GLOBAL_KEYS.includes(k)) continue;
      del.run(k);
      insert.run(k, String(v));
    }
  })();
  logActivity({ userId: req.user.id, action: 'admin_update_grading_settings', entity: 'settings', detail: { keys: Object.keys(settings) }, ip: req.ip });
  const updated = db.prepare('SELECT key, value FROM grading_settings WHERE teacher_id IS NULL ORDER BY id').all();
  res.json({ settings: Object.fromEntries(updated.map(r => [r.key, r.value])) });
});

// GET /api/admin/backup/db — ดาวน์โหลด SQLite backup (admin & teacher)
router.get('/backup/db', authenticate, requireRole('admin', 'teacher'), async (req, res) => {
  try {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const dest = join(__dirname, `../../data/backup_${date}.db`);
    await db.backup(dest);
    logActivity({ userId: req.user.id, action: 'admin_backup_db', entity: 'database', ip: req.ip });
    res.download(dest, `app_${date}.db`, (err) => {
      if (err && !res.headersSent) res.status(500).json({ error: 'Download failed' });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/backup/uploads — ดาวน์โหลด tar.gz ของไฟล์ที่นิสิตส่งทั้งหมด (admin only)
router.get('/backup/uploads', authenticate, requireRole('admin'), (req, res) => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  logActivity({ userId: req.user.id, action: 'admin_backup_uploads', entity: 'uploads', ip: req.ip });

  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="uploads_${date}.tar.gz"`);

  // -C src/ แล้ว tar "uploads" → path ใน archive เป็น uploads/...
  const src = join(__dirname, '../uploads/..');
  const tar = spawn('tar', ['czf', '-', '-C', src, 'uploads']);
  tar.stdout.pipe(res);
  tar.stderr.on('data', (d) => console.error('[backup/uploads] tar:', d.toString()));
  tar.on('error', (e) => {
    console.error('[backup/uploads]', e.message);
    if (!res.headersSent) res.status(500).json({ error: 'tar failed' });
    else res.destroy();
  });
});

export default router;
