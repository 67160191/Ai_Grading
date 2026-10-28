import db from '../db/database.js';

/**
 * @param {{ userId?: number, action: string, entity?: string, entityId?: number, detail?: object, ip?: string }} opts
 */
export function logActivity({ userId, action, entity, entityId, detail, ip } = {}) {
  try {
    db.prepare(`
      INSERT INTO activity_logs (user_id, action, entity, entity_id, detail, ip)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      userId ?? null,
      action,
      entity ?? null,
      entityId ?? null,
      detail ? JSON.stringify(detail) : null,
      ip ?? null,
    );
  } catch {
    // ไม่ให้ log error กระทบ request หลัก
  }
}
