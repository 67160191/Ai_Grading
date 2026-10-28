# ระบบช่วยตรวจงานและให้คำแนะนำด้วย AI

**Intelligent Assignment Grading & Feedback Platform using LLM**

ระบบช่วยอาจารย์ตรวจงานนิสิตโดยใช้ LLM (Ollama) ประเมินตาม Rubric ที่กำหนด พร้อม Feedback เฉพาะบุคคล และ Human Review Interface สำหรับอาจารย์ตรวจสอบผลก่อนประกาศคะแนน

---

## Tech Stack

| ส่วน          | เทคโนโลยี                                  |
| ------------- | ------------------------------------------ |
| Backend       | Node.js (ESM), Express.js                  |
| Database      | SQLite (better-sqlite3)                    |
| Frontend      | React + Vite, TanStack Query, Tailwind CSS |
| LLM           | Ollama (Qwen, Llama, Gemma ฯลฯ)            |
| File Parsing  | pdf-parse, mammoth                         |
| Auth          | JWT (jsonwebtoken), bcryptjs               |
| File Upload   | Multer                                     |
| Rate Limiting | express-rate-limit                         |

---

## Features

### อาจารย์

- สร้าง/จัดการวิชา และ Assignment พร้อม Deadline
- เลือกสีการ์ดวิชา (7 สี pastel: indigo, pink, emerald, amber, sky, violet, rose)
- จัดประเภทงาน (Essay, Problem Set, Code Review, Other)
- สร้าง Rubric Template ระดับวิชา (criteria + levels 1-4 ดีเยี่ยม/ดี/พอใช้/ต้องปรับปรุง) — levels ไม่บังคับกรอก
- ร่าง Rubric ด้วย AI จากคำอธิบายงาน — ระบุจำนวนเกณฑ์ ได้ draft พร้อม 4 ระดับและคำอธิบายแต่ละระดับ แล้วแก้ต่อ (ใช้ได้ทั้ง Template และ Override)
- ปุ่มเติมระดับมาตรฐาน (ดีมาก/ดี/พอใช้/ต้องปรับปรุง) ทุกเกณฑ์ในคลิกเดียว
- กำหนด Custom Rubric Override เฉพาะ Assignment
- สั่ง AI ตรวจงาน (Ollama) หรือ re-grade ซ้ำได้
- ดูผลงานนิสิต พร้อม extracted text จาก PDF/DOCX/TXT
- Approve / Reject / แก้คะแนนเอง + Audit Trail
- Auto-approve อัตโนมัติเมื่อคะแนน AI ถึงเกณฑ์ที่กำหนด
- ดู Consistency Report — variance, outliers ต่อ criteria
- Export คะแนนทั้งหมดเป็น CSV (ต่อ Assignment)
- Export รายชื่อนิสิตในวิชาเป็น CSV
- Export คะแนนรวมทั้งวิชา เลือกรูปแบบได้ 2 แบบ: **latest** (ครั้งล่าสุด) หรือ **best** (คะแนนสูงสุด)
- Import นิสิตจาก CSV (3 คอลัมน์: กลุ่ม, รหัสนิสิต, ชื่อนามสกุล)
- แก้ไขเลขกลุ่มนิสิต (group_no) ได้โดยตรงในตาราง
- ลบนิสิตรายคน หรือลบทั้งหมดออกจากวิชา (พร้อมลบ submissions)
- Reset password นิสิต (reset เป็นรหัสนิสิต)
- ปิด/เปิด enrollment (join code) ต่อวิชา
- Duplicate วิชา (copy Rubric + Assignment ทั้งหมด ไม่รวมนิสิตและงานที่ส่ง)
- ตอบกลับ Appeal จากนิสิต
- Bulk Approve งานทั้งหมดที่ตรวจแล้วในงานครั้งเดียว
- เปลี่ยนรหัสผ่านผ่าน dropdown ชื่อ user

### Admin

- จัดการผู้ใช้ (สร้าง/รีเซ็ต password อาจารย์)
- ตั้งค่า LLM parameters (Ollama URL, Model, Temperature, Top P, Repeat Penalty, Seed, Max Tokens)
- ดาวน์โหลด Backup ฐานข้อมูล SQLite (`GET /api/admin/backup/db`)
- ดู Activity Log ของระบบ

### นิสิต

- ส่งงานเป็นไฟล์ PDF/DOCX/TXT หรือ Text Input
- ส่งงานซ้ำ (resubmit) ได้ไม่จำกัดครั้ง
- ดูคะแนน + Feedback รายละเอียดต่อ criteria
- เปรียบเทียบคะแนนกับ Class Average
- ดูประวัติการส่งงานทุกครั้งในหน้าผลการตรวจ พร้อมเปรียบเทียบคะแนนแต่ละครั้ง
- ส่ง Appeal พร้อมเหตุผล และดูคำตอบกลับจากอาจารย์
- เปลี่ยนรหัสผ่านผ่าน dropdown ชื่อ user

---

## โครงสร้างโปรเจกต์

```
AI-Feedback/
├── backend/
│   ├── src/
│   │   ├── db/           # SQLite schema, migrations, seed
│   │   ├── routes/       # Express routes
│   │   ├── services/     # grading.js (LLM logic)
│   │   ├── middleware/   # auth, requireRole, logger
│   │   └── uploads/      # ไฟล์งานที่นิสิตส่ง
│   └── data/             # app.db (SQLite)
└── frontend/
    └── src/
        ├── api/          # axios client functions
        ├── components/   # Layout, shared components
        └── pages/
            ├── teacher/  # หน้าอาจารย์
            └── student/  # หน้านิสิต
```

---

## การติดตั้งและรัน

### วิธีที่ 1 — Docker (แนะนำ)

#### ความต้องการ

- [Docker](https://docs.docker.com/get-docker/) + Docker Compose

#### ขั้นตอน

```bash
# 1. copy และแก้ไข .env
cp backend/.env.example backend/.env
# แก้ JWT_SECRET และ OLLAMA_URL ใน backend/.env

# 2. build และ start
docker compose up -d --build
```

ระบบจะรันที่ `http://localhost` (port 80)

> **OLLAMA_URL**: ถ้า Ollama รันบนเครื่องเดียวกับ Docker ให้ใช้ `http://host.docker.internal:11434`
> ถ้า Ollama รันบน GPU Server แยก ให้ใส่ IP จริง เช่น `http://10.80.39.41:11434`

**คำสั่งที่ใช้บ่อย:**

```bash
docker compose up -d          # start (background)
docker compose down           # stop
docker compose logs -f        # ดู logs
docker compose restart        # restart ทุก service
```

ข้อมูล (SQLite DB + uploads) เก็บใน Docker volumes — ไม่หายเมื่อ restart

---

### วิธีที่ 2 — รันตรง (Development)

#### ความต้องการ

- Node.js 18+
- [Ollama](https://ollama.com) พร้อม model ที่ต้องการ เช่น `ollama pull qwen3-coder:30b`

#### Backend

```bash
cd backend
npm install
```

สร้างไฟล์ `.env` (**จำเป็น** — copy จาก `.env.example`):

```env
JWT_SECRET=your-random-secret-at-least-32-chars   # บังคับ — server จะไม่ start ถ้าไม่มี
JWT_EXPIRES_IN=7d
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen3-coder:30b
MAX_FILE_SIZE_MB=20
MAX_FEEDBACK_LENGTH=2000
```

รัน:

```bash
npm run dev
```

Backend จะรันที่ `http://localhost:3000`

#### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend จะรันที่ `http://localhost:5173`

---

## Default Accounts (seed)

ระบบไม่มี seed accounts — ต้องสมัครเองผ่าน `POST /api/auth/register`

```json
{
  "name": "อาจารย์ก",
  "username": "teacher01",
  "password": "1234",
  "role": "teacher"
}
```

> **การสมัครรองรับเฉพาะ `role: "teacher"` เท่านั้น** — นิสิตต้องให้อาจารย์ Import เข้าระบบ
> สำหรับอาจารย์: ตั้ง `username` เองได้
> นิสิตที่ถูก Import จะมี `password` default = รหัสนิสิต (= username) — เปลี่ยนได้ภายหลัง

---

## LLM Settings

ตั้งค่าได้ที่หน้า **ตั้งค่า AI** (teacher เท่านั้น) หรือผ่าน `PUT /api/settings/grading`

**การเชื่อมต่อ:**

| Parameter        | Default    | คำอธิบาย                   |
| ---------------- | ---------- | -------------------------- |
| Ollama URL       | (จาก .env) | URL ของ Ollama server      |
| ความยาวงานสูงสุด | 8,000      | ตัวอักษรของงานที่ส่งให้ AI |

**LLM Parameters:**

| Parameter      | Default         | คำอธิบาย                              |
| -------------- | --------------- | ------------------------------------- |
| Model          | qwen3-coder:30b | model ที่ pull ไว้ใน Ollama           |
| Temperature    | 0.2             | ความสร้างสรรค์ของคำตอบ                |
| Top P          | 0.9             | ความหลากหลายของคำตอบ                  |
| Repeat Penalty | 1.1             | ลดการเขียนซ้ำๆ                        |
| Seed           | (ว่าง)          | ว่าง = สุ่ม, ใส่ตัวเลข = reproducible |
| Max Tokens     | 2048            | ความยาวสูงสุดของคำตอบ                 |

---

## เอกสารเพิ่มเติม

- [API-DOC.md](API-DOC.md) — API endpoints ทั้งหมด
- [MANUAL.md](MANUAL.md) — คู่มือการใช้งาน
