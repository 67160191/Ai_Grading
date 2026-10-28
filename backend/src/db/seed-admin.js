/**
 * seed-admin.js — สร้าง admin account แรก
 *
 * วิธีใช้:
 *   node src/db/seed-admin.js <username> <password> <name>
 *
 * ตัวอย่าง:
 *   node src/db/seed-admin.js admin Admin1234 "ผู้ดูแลระบบ"
 */

import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(__dirname, '../../data/app.db'));

const [,, username, password, name] = process.argv;

if (!username || !password || !name) {
  console.error('Usage: node src/db/seed-admin.js <username> <password> <name>');
  process.exit(1);
}

if (password.length < 6) {
  console.error('Error: password must be at least 6 characters');
  process.exit(1);
}

const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
if (existing) {
  console.error(`Error: username "${username}" already exists`);
  process.exit(1);
}

const hashed = bcrypt.hashSync(password, 10);
const result = db.prepare(
  'INSERT INTO users (name, username, password, role) VALUES (?, ?, ?, ?)'
).run(name, username, hashed, 'admin');

console.log(`✅ Admin account created: id=${result.lastInsertRowid}, username="${username}", name="${name}"`);
