import { Router } from 'express';
import db from '../db/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// GET /api/logs — teacher ดู activity logs
router.get('/', authenticate, requireRole('teacher', 'admin'), (req, res) => {
  const { limit = 100, action, userId } = req.query;

  let sql = `
    SELECT al.*, u.name AS user_name, u.username, u.role AS user_role
    FROM activity_logs al
    LEFT JOIN users u ON u.id = al.user_id
    WHERE 1=1
  `;
  const params = [];

  if (action) { sql += ' AND al.action = ?'; params.push(action); }
  if (userId) { sql += ' AND al.user_id = ?'; params.push(userId); }

  sql += ' ORDER BY al.created_at DESC LIMIT ?';
  params.push(Math.min(Number(limit), 500));

  const logs = db.prepare(sql).all(...params);
  res.json({ logs });
});

export default router;
