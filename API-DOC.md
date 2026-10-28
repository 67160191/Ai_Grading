# API Documentation — AI Grading & Feedback System

**Base URL:** `http://localhost:3000/api`
**Auth:** JWT Bearer Token — ใส่ใน header `Authorization: Bearer <token>`

## สารบัญ

1. [System](#system)
2. [Authentication](#authentication)
3. [Courses](#courses)
4. [Rubrics](#rubrics)
5. [Assignments](#assignments)
6. [Error Responses](#error-responses)
7. [Grading](#grading)
8. [Rubric Levels](#rubric-levels)
9. [Custom Rubric Override](#custom-rubric-override-assignment-level)
10. [Appeals](#appeals)
11. [Settings](#settings)
12. [Activity Logs](#activity-logs)
13. [Admin](#admin)
14. [Coming Soon](#coming-soon)

---

## System

### GET `/health`

ตรวจสอบสถานะระบบ — ไม่ต้อง Auth

**Response 200**

```json
{ "status": "ok", "version": "1.2.1", "timestamp": "2026-03-26T10:00:00.000Z" }
```

---

## Authentication

### POST `/auth/register`

สมัครสมาชิก — **เปิดให้เฉพาะอาจารย์เท่านั้น** นิสิตต้องถูก Import ผ่าน CSV โดยอาจารย์

**Rate limit:** 5 requests / 15 นาที ต่อ IP

**Body**

```json
{
  "name": "อาจารย์ก",
  "username": "teacher01",
  "password": "1234",
  "role": "teacher"
}
```

> `role` ต้องเป็น `"teacher"` เท่านั้น — ส่ง `"student"` หรือ role อื่นจะได้ 403 Forbidden
> `username` สำหรับอาจารย์ตั้งเองได้

**Honeypot:** ถ้า request body มี field `website` ที่มีค่า (ไม่ว่าง) จะได้รับ 400 Bad Request — ใช้ตรวจ bot

**Response 201**

```json
{
  "token": "eyJ...",
  "user": {
    "id": 1,
    "name": "อาจารย์ก",
    "username": "teacher01",
    "role": "teacher"
  }
}
```

**Error Responses**
| Status | เหตุ |
|--------|------|
| 400 | ข้อมูลไม่ครบ หรือ honeypot field `website` มีค่า |
| 403 | `role` ไม่ใช่ `"teacher"` |
| 409 | Username ซ้ำ |
| 429 | Rate limit เกิน (5 req/15 นาที) |

---

### POST `/auth/login`

เข้าสู่ระบบ

**Rate limit:** 5 requests / 15 นาที ต่อ IP

**Body**

```json
{
  "username": "teacher01",
  "password": "1234"
}
```

**Honeypot:** ถ้า request body มี field `website` ที่มีค่า จะได้รับ 401 Unauthorized — ใช้ตรวจ bot

**Response 200**

```json
{
  "token": "eyJ...",
  "user": {
    "id": 1,
    "name": "อาจารย์ก",
    "username": "teacher01",
    "role": "teacher"
  }
}
```

**Error Responses**
| Status | เหตุ |
|--------|------|
| 401 | username/password ไม่ถูกต้อง หรือ honeypot field `website` มีค่า |
| 429 | Rate limit เกิน (5 req/15 นาที) |

---

### GET `/auth/me`

ดูข้อมูลผู้ใช้ปัจจุบัน

**Auth required**

**Response 200**

```json
{
  "user": {
    "id": 1,
    "name": "อาจารย์ก",
    "username": "teacher01",
    "role": "teacher"
  }
}
```

---

### PUT `/auth/change-password`

เปลี่ยนรหัสผ่าน — ใช้ได้ทุก role (teacher และ student)

**Auth required**

**Body**

```json
{
  "currentPassword": "รหัสผ่านเดิม",
  "newPassword": "รหัสผ่านใหม่"
}
```

> `newPassword` ต้องมีความยาวอย่างน้อย 6 ตัวอักษร

**Response 200**

```json
{
  "message": "เปลี่ยนรหัสผ่านสำเร็จ"
}
```

**Error Responses**
| Status | เหตุ |
|--------|------|
| 400 | `newPassword` สั้นกว่า 6 ตัวอักษร หรือข้อมูลไม่ครบ |
| 401 | `currentPassword` ไม่ถูกต้อง หรือไม่ได้ login |

---

## Courses

### GET `/courses`

ดูรายการวิชา

- Teacher → เห็นวิชาของตัวเอง
- Student → เห็นวิชาที่ enroll ไว้

**Auth required**

**Query Parameters**

| Parameter  | ค่า               | Default | คำอธิบาย                                                            |
| ---------- | ----------------- | ------- | ------------------------------------------------------------------- |
| `archived` | `true` \| `false` | `false` | `true` = ดูเฉพาะวิชาที่ Archive แล้ว, `false` = ดูเฉพาะวิชาปัจจุบัน |

**Response 200**

```json
{
  "courses": [
    {
      "id": 1,
      "name": "Python Programming",
      "description": "วิชา Python เบื้องต้น",
      "teacher_id": 1,
      "join_code": "3J4-7TB",
      "color": "indigo",
      "semester": "1/2568",
      "student_count": 25,
      "created_at": "2024-01-01T00:00:00"
    }
  ]
}
```

---

### GET `/courses/summary`

ดูสถิติสรุปรวมทุกวิชาสำหรับ Teacher (ใช้แสดง summary cards ในหน้าหลัก)

**Auth required | Role: teacher**

**Response 200**

```json
{
  "pending_grading": 5,
  "pending_approval": 12,
  "pending_appeals": 3
}
```

> นับเฉพาะ submission ล่าสุดต่อนิสิตต่องาน ตรงกับตัวเลขใน AssignmentDetailPage
> `pending_grading` — submissions ที่ยังไม่ได้ส่ง AI ตรวจ (status = `pending`)
> `pending_approval` — submissions ที่ AI ตรวจแล้ว รอ Teacher Approve (status = `graded`)
> `pending_appeals` — appeals ที่ status = `pending`

---

### PUT `/courses/:id/archive`

Toggle archive status ของวิชา (archive ↔ unarchive)

**Auth required | Role: teacher (เจ้าของวิชา)**

**Response 200**

```json
{ "message": "Course archived" }
```

หรือ

```json
{ "message": "Course unarchived" }
```

> เรียก endpoint นี้ซ้ำเพื่อสลับสถานะ — ถ้า archived อยู่จะกลับเป็น active, ถ้า active จะ archive

---

### POST `/courses`

สร้างวิชาใหม่

**Auth required | Role: teacher**

**Body**

```json
{
  "name": "Python Programming",
  "description": "วิชา Python เบื้องต้น",
  "color": "indigo",
  "semester": "1/2568"
}
```

> `color` optional — ค่าที่ใช้ได้: `"indigo"` | `"pink"` | `"emerald"` | `"amber"` | `"sky"` | `"violet"` | `"rose"` | `"orange"` | `"fuchsia"` | `"white"` (default: `"indigo"`)
> `semester` optional — ภาคเรียน เช่น `"1/2568"`, `"2/2568"` ใช้แสดง badge บนการ์ดและ filter

**Response 201**

```json
{
  "course": {
    "id": 1,
    "name": "Python Programming",
    "description": "...",
    "teacher_id": 1,
    "join_code": "3J4-7TB",
    "color": "indigo",
    "semester": "1/2568",
    "created_at": "..."
  }
}
```

---

### GET `/courses/:id`

ดูรายละเอียดวิชา

**Auth required**

**Response 200**

```json
{
  "course": {
    "id": 1,
    "name": "Python Programming",
    "description": "...",
    "teacher_id": 1,
    "join_code": "3J4-7TB",
    "created_at": "..."
  }
}
```

---

### PUT `/courses/:id`

แก้ไขข้อมูลวิชา

**Auth required | Role: teacher (เจ้าของวิชาเท่านั้น)**

**Body** (ส่งแค่ field ที่ต้องการแก้)

```json
{
  "name": "Python Advanced",
  "description": "อัปเดตคำอธิบาย",
  "color": "emerald",
  "semester": "2/2568"
}
```

**Response 200**

```json
{
  "course": { "id": 1, "name": "Python Advanced", ... }
}
```

---

### DELETE `/courses/:id`

ลบวิชา (ลบ assignments, submissions ที่เกี่ยวข้องด้วย)

**Auth required | Role: teacher (เจ้าของวิชาเท่านั้น)**

**Response 200**

```json
{ "message": "Course deleted" }
```

---

### POST `/courses/enroll`

นิสิต enroll วิชาด้วย join_code

**Auth required | Role: student**

**Body**

```json
{ "join_code": "3J4-7TB" }
```

**Response 201**

```json
{ "message": "Enrolled successfully", "course": { "id": 1, "name": "Python Programming", "join_code": "3J4-7TB", ... } }
```

**Error 404** — ไม่พบรหัสวิชา
**Error 409** — เข้าร่วมวิชานี้แล้ว

---

### GET `/courses/:id/students`

ดูรายชื่อนิสิตในวิชา

**Auth required | Role: teacher (เจ้าของวิชาเท่านั้น)**

**Response 200**

```json
{
  "students": [
    {
      "id": 2,
      "name": "นิสิต A",
      "username": "6501234567",
      "group_no": "1",
      "enrolled_at": "..."
    }
  ]
}
```

---

### PUT `/courses/:id/students/:studentId`

แก้ไขข้อมูล enrollment ของนิสิต (group_no)

**Auth required | Role: teacher (เจ้าของวิชา)**

**Body**

```json
{ "group_no": "2" }
```

**Response 200**

```json
{ "message": "Updated" }
```

---

### PUT `/courses/:id/students/:studentId/reset-password`

รีเซ็ต password นิสิตกลับเป็น username (รหัสนิสิต)

**Auth required | Role: teacher (เจ้าของวิชา)**

**Response 200**

```json
{ "message": "Password reset to username" }
```

---

### DELETE `/courses/:id/students/:studentId`

ลบนิสิตออกจากวิชา (พร้อม submissions ทั้งหมดในวิชานี้)

**Auth required | Role: teacher (เจ้าของวิชาเท่านั้น)**

**Response 200**

```json
{ "message": "Student removed" }
```

---

### POST `/courses/:id/duplicate`

สร้างสำเนาวิชา พร้อม Rubric, Assignment, Calibration Examples และ Rubric Override ทั้งหมด (ไม่รวมนิสิตและ submissions)

**Auth required | Role: teacher (เจ้าของวิชา)**

**Body**

```json
{ "semester": "1/2569" }
```

> `semester` optional — ภาคเรียนของวิชาใหม่ที่สร้าง ถ้าไม่ส่งมาจะเป็น null
> ชื่อวิชาใหม่จะใช้ชื่อเดิม (ไม่ต่อ "(copy)" อีกต่อไป) — สีการ์ดจะสุ่มใหม่ไม่ซ้ำสีเดิม
> สิ่งที่คัดลอก: Rubric Templates (criteria + levels), Assignments (title/desc/deadline/type), Calibration Examples, Rubric Override (criteria + levels)
> สิ่งที่ไม่คัดลอก: นิสิต, Submissions, คะแนน, Correction History

**Response 201**

```json
{
  "course": {
    "id": 5,
    "name": "ชื่อวิชา",
    "join_code": "XYZ-123",
    "color": "emerald",
    "semester": "1/2569"
  }
}
```

---

### GET `/courses/:id/students/export`

Export รายชื่อนิสิตในวิชาเป็น CSV

**Auth required | Role: teacher (เจ้าของวิชา)**

**Response:** ไฟล์ CSV (`text/csv; charset=utf-8`)

**Columns:** `กลุ่ม`, `รหัสนิสิต`, `ชื่อ`, `วันที่เข้าร่วม`

> ไฟล์มี UTF-8 BOM เพื่อให้ Excel เปิดได้ถูกต้อง

---

### GET `/courses/:id/grades/export`

Export คะแนนรวมทั้งวิชาเป็น CSV (ทุก Assignment)

**Auth required | Role: teacher (เจ้าของวิชา)**

**Query Parameters**

| Parameter | ค่า                | Default  | คำอธิบาย                                                                    |
| --------- | ------------------ | -------- | --------------------------------------------------------------------------- |
| `mode`    | `latest` \| `best` | `latest` | `latest` = คะแนนจากการส่งครั้งล่าสุด, `best` = คะแนนสูงสุดจากทุกครั้งที่ส่ง |

**Response:** ไฟล์ CSV (`text/csv; charset=utf-8`)

**Filename:** `grades-latest-{id}.csv` หรือ `grades-best-{id}.csv` ตาม mode

**Columns:** `กลุ่ม`, `รหัสนิสิต`, `ชื่อ`, `งาน1`, `งาน2`, ..., `รวม`

> แต่ละคอลัมน์งานแสดงคะแนนของนิสิตคนนั้นต่องานนั้น — ว่างถ้ายังไม่ส่งหรือยังไม่ตรวจ
> ถ้า submission ถูก approve แล้ว จะใช้ `final_level` แทน `avg_level`

---

### POST `/courses/:id/import-students`

Import รายชื่อนิสิตจาก CSV เข้าวิชา

**Auth required | Role: teacher (เจ้าของวิชา)**

**Content-Type:** `application/json`

**Body**

```json
{
  "csv_text": "1,6501234567,สมชาย ใจดี\n1,6501234568,สมหญิง ใจงาม\n2,6501234569,มานะ รักเรียน"
}
```

หรือ multipart upload ไฟล์ `.csv` โดยตรง

**รูปแบบ CSV:** 3 คอลัมน์ — `กลุ่ม,รหัสนิสิต,ชื่อนามสกุล`

> `username` ของนิสิตที่สร้างใหม่ = รหัสนิสิต (คอลัมน์ที่ 2)
> `password` default = รหัสนิสิต (username) — นิสิตสามารถเปลี่ยนได้ภายหลัง
> ถ้า username ซ้ำกับที่มีอยู่แล้ว ระบบจะ enroll นิสิตคนนั้นเข้าวิชาโดยไม่สร้าง account ใหม่

**Response 200**

```json
{
  "imported": 25,
  "skipped": 2,
  "errors": []
}
```

---

## Rubrics

### GET `/courses/:id/rubrics`

ดูรายการ Rubric Template ของวิชา

**Auth required**

**Response 200**

```json
{
  "rubrics": [
    {
      "id": 1,
      "course_id": 1,
      "name": "Python Template",
      "description": "...",
      "criteria_count": 4,
      "created_at": "..."
    }
  ]
}
```

---

### POST `/courses/:id/rubrics`

สร้าง Rubric Template ใหม่

**Auth required | Role: teacher (เจ้าของวิชาเท่านั้น)**

**Body**

```json
{
  "name": "Python Rubric",
  "description": "เกณฑ์สำหรับงาน Python",
  "criteria": [
    { "name": "Correctness", "description": "โค้ดทำงานถูกต้อง" },
    { "name": "Code Quality", "description": "โค้ดอ่านง่าย clean" },
    { "name": "Efficiency", "description": "ประสิทธิภาพของอัลกอริทึม" },
    { "name": "Documentation", "description": "มี comment และ docstring" }
  ]
}
```

> แต่ละ criteria มี level เท่ากัน (1–4, AAC&U scale) — ไม่มี `max_score` หรือ `weight`

**Response 201**

```json
{
  "rubric": {
    "id": 1,
    "course_id": 1,
    "name": "Python Rubric",
    "description": "...",
    "created_at": "...",
    "criteria": [
      {
        "id": 1,
        "rubric_id": 1,
        "name": "Correctness",
        "description": "...",
        "order_index": 0,
        "levels": []
      }
    ]
  }
}
```

---

### GET `/rubrics/:id`

ดู Rubric พร้อม criteria ทั้งหมด

**Auth required**

**Response 200**

```json
{
  "rubric": {
    "id": 1,
    "name": "Python Rubric",
    "criteria": [ ... ]
  }
}
```

---

### PUT `/rubrics/:id`

แก้ไข Rubric (ถ้าส่ง `criteria` จะลบของเดิมและแทนใหม่ทั้งหมด)

**Auth required | Role: teacher (เจ้าของวิชาเท่านั้น)**

**Body**

```json
{
  "name": "Python Rubric v2",
  "criteria": [
    { "name": "Correctness", "description": "..." },
    { "name": "Code Quality", "description": "..." },
    { "name": "Documentation", "description": "..." }
  ]
}
```

**Response 200**

```json
{
  "rubric": { "id": 1, "name": "Python Rubric v2", "criteria": [ ... ] }
}
```

---

### DELETE `/rubrics/:id`

ลบ Rubric

**Auth required | Role: teacher (เจ้าของวิชาเท่านั้น)**

**Response 200**

```json
{ "message": "Rubric deleted" }
```

---

### POST `/rubrics/generate`

ร่าง Rubric จากคำอธิบายงานด้วย AI — **ไม่บันทึกลง DB** อาจารย์นำ draft ไปแก้แล้วกด `POST /courses/:id/rubrics` เอง

**Auth required | Role: teacher**

**Body**

```json
{ "task": "เขียนโปรแกรม Python คำนวณเกรดเฉลี่ยจากไฟล์ CSV พร้อม handle error", "count": 4 }
```

- `task` — คำอธิบายงาน (≥ 10 ตัวอักษร, ตัดที่ 4000)
- `count` — จำนวนเกณฑ์ที่ต้องการ (1–8, default 4)

**Response 200** — เกณฑ์เป็นภาษาไทยเสมอ, ทุกเกณฑ์มี 4 ระดับ (score 4→1) พร้อม label มาตรฐาน + คำอธิบายที่เขียนให้ AI grader ใช้ตัดสินคะแนน

```json
{
  "rubric": {
    "name": "เกณฑ์ประเมินโปรแกรม Python",
    "description": "...",
    "criteria": [
      {
        "name": "ความถูกต้องของผลลัพธ์",
        "description": "...",
        "min_score": 1,
        "max_score": 4,
        "levels": [
          { "score": 4, "label": "ดีมาก", "description": "..." },
          { "score": 3, "label": "ดี", "description": "..." },
          { "score": 2, "label": "พอใช้", "description": "..." },
          { "score": 1, "label": "ต้องปรับปรุง", "description": "..." }
        ]
      }
    ]
  }
}
```

**Error** — `400` task สั้นเกินไป · `502` เรียก Ollama ไม่สำเร็จ / AI ไม่คืนเกณฑ์

---

## Assignments

### GET `/courses/:id/assignments`

ดูรายการงานในวิชา

**Auth required**

**Response 200**

```json
{
  "assignments": [
    {
      "id": 1,
      "course_id": 1,
      "rubric_id": 1,
      "rubric_name": "Python Rubric",
      "title": "Lab 1 - Hello World",
      "description": "...",
      "deadline": "2024-02-01T23:59:00",
      "auto_approve_threshold": 3.0,
      "allow_paste": 1,
      "created_at": "...",
      "latest_submission_id": 5,
      "latest_status": "graded",
      "latest_attempt": 2,
      "latest_submitted_at": "...",
      "latest_avg_level": 2.75
    }
  ]
}
```

---

### POST `/courses/:id/assignments`

สร้างงานใหม่

**Auth required | Role: teacher (เจ้าของวิชาเท่านั้น)**

**Body**

```json
{
  "title": "Lab 1 - Hello World",
  "description": "เขียน Python program ที่รับ input แล้ว print output",
  "deadline": "2024-02-01T23:59:00",
  "rubric_id": 1,
  "auto_approve_threshold": 3.0,
  "allow_paste": true
}
```

> `rubric_id` optional — ถ้าไม่ส่งจะยังไม่มี rubric
> `auto_approve_threshold` optional (1.0–4.0) — avg level ขั้นต่ำที่จะ auto-approve หลัง AI ตรวจ เช่น `3.0` หมายความว่า avg level ≥ 3.0/4 จะ Approve อัตโนมัติ, `null` = ปิด
> `allow_paste` optional (default `true`) — `false` = บังคับนักเรียนพิมพ์คำตอบเองในกล่องข้อความ ห้ามวาง (paste) และห้ามอัปโหลดไฟล์ (ทั้ง frontend และ backend บล็อก)

**Response 201**

```json
{
  "assignment": { "id": 1, "course_id": 1, "rubric_id": 1, "title": "Lab 1 - Hello World", ... }
}
```

---

### GET `/assignments/:id`

ดูรายละเอียดงาน

**Auth required**

**Response 200**

```json
{
  "assignment": { "id": 1, "title": "Lab 1", "rubric_name": "Python Rubric", ... }
}
```

---

### PUT `/assignments/:id`

แก้ไขงาน

**Auth required | Role: teacher (เจ้าของวิชาเท่านั้น)**

**Body** (ส่งแค่ field ที่ต้องการแก้)

```json
{
  "title": "Lab 1 - Updated",
  "deadline": "2024-02-05T23:59:00",
  "rubric_id": 2,
  "auto_approve_threshold": 3.0,
  "allow_paste": false
}
```

> ส่ง `"auto_approve_threshold": null` เพื่อปิด auto-approve
> `allow_paste: false` มีผลย้อนหลังกับ submission ใหม่เท่านั้น (ไม่กระทบงานที่ส่งไปแล้ว)

**Response 200**

```json
{
  "assignment": { "id": 1, "title": "Lab 1 - Updated", ... }
}
```

---

### DELETE `/assignments/:id`

ลบงาน

**Auth required | Role: teacher (เจ้าของวิชาเท่านั้น)**

**Response 200**

```json
{ "message": "Assignment deleted" }
```

---

### GET `/assignments/:id/export/csv`

Export คะแนนนิสิตทั้งหมดของงานเป็น CSV

**Auth required | Role: teacher (เจ้าของวิชา)**

**Response:** ไฟล์ CSV (`text/csv; charset=utf-8`)

**Columns:** `student_name`, `username`, `attempt`, `status`, `submitted_at`, `avg_level (/4)`, แล้วตามด้วยคอลัมน์ level แยกต่อ criteria เช่น `Correctness`, `Code Quality`

> ไฟล์มี UTF-8 BOM เพื่อให้ Excel เปิดได้ถูกต้อง
> criteria_name ใช้ snapshot จาก grades table — ไม่กระทบถ้าแก้ Rubric หลังตรวจแล้ว

---

### POST `/assignments/extract-text`

นิสิต upload ไฟล์เพื่อ extract text ก่อนส่งงาน (ใช้เมื่ออัปโหลดไฟล์ต้องการเห็นผลการ extract ก่อนส่ง)

**Auth required | Role: student**

**Content-Type:** `multipart/form-data`

| Field  | Type | Required | Description               |
| ------ | ---- | -------- | ------------------------- |
| `file` | File | Yes      | PDF, DOCX, TXT (max 20MB) |

**Response 200**

```json
{
  "text": "เนื้อหาข้อความที่ extract ออกมาจากไฟล์..."
}
```

**Response 400**

```json
{
  "error": "ไม่สามารถอ่านไฟล์ได้ (เช่น PDF ไม่มีข้อความ)"
}
```

---

### POST `/assignments/:id/submit`

นิสิต submit งาน (resubmit ได้ — attempt จะเพิ่มขึ้น)

**Auth required | Role: student (ต้อง enroll วิชานั้น)**

**Content-Type:** `multipart/form-data`

| Field          | Type | Required              | Description               |
| -------------- | ---- | --------------------- | ------------------------- |
| `file`         | File | ถ้าไม่มี content_text | PDF, DOCX, TXT (max 20MB) |
| `content_text` | Text | ถ้าไม่มี file         | ส่งเป็น text โดยตรง       |

> ส่งอย่างใดอย่างหนึ่งก็ได้ หรือส่งทั้งคู่
> ถ้างานนั้นตั้งค่า `allow_paste: false` — ส่ง `file` ไม่ได้ (400 error), ต้องส่ง `content_text` เท่านั้น

**Response 201**

```json
{
  "submission": {
    "id": 1,
    "assignment_id": 1,
    "student_id": 2,
    "file_path": "1706745600000-123456.pdf",
    "content_text": null,
    "attempt": 1,
    "status": "pending",
    "submitted_at": "..."
  }
}
```

---

### GET `/assignments/:id/my-submissions`

ประวัติการส่งงานทั้งหมดของนิสิตที่ login สำหรับงานนี้ (เรียงจากล่าสุดก่อน)

**Auth required | Role: student (ต้อง enroll วิชานั้น)**

**Response 200**

```json
{
  "submissions": [
    {
      "id": 3,
      "attempt": 2,
      "status": "approved",
      "submitted_at": "...",
      "content_text": "...",
      "avg_level": 3.25,
      "job_status": "done"
    },
    {
      "id": 1,
      "attempt": 1,
      "status": "rejected",
      "submitted_at": "...",
      "content_text": "...",
      "avg_level": 1.5,
      "job_status": "done"
    }
  ]
}
```

---

## Error Responses

| Status | Meaning                                              |
| ------ | ---------------------------------------------------- |
| 400    | Bad Request — ข้อมูลไม่ครบหรือไม่ถูกต้อง             |
| 401    | Unauthorized — ไม่มี token หรือ token หมดอายุ        |
| 403    | Forbidden — role ไม่มีสิทธิ์                         |
| 404    | Not Found — ไม่พบข้อมูล                              |
| 409    | Conflict — ข้อมูลซ้ำ (เช่น username ซ้ำ, enroll ซ้ำ) |

**Error format**

```json
{ "error": "Error message here" }
```

---

## Grading

> เมื่อ student submit งานที่มี rubric → grading job จะเริ่มอัตโนมัติ
> Teacher สามารถสั่ง re-grade ได้ตลอดเวลา

### POST `/submissions/:id/grade`

สั่ง LLM ตรวจงาน (หรือ re-grade)

**Auth required | Role: teacher (เจ้าของวิชา)**

**Response 202**

```json
{
  "message": "Grading started",
  "job_id": 1,
  "submission_id": 1
}
```

---

### GET `/jobs/:id/status`

ดู status ของ grading job — ใช้ polling ทุก 3 วิ

**Auth required**

**Response 200**

```json
{
  "job_id": 1,
  "submission_id": 1,
  "status": "done",
  "error": null,
  "created_at": "...",
  "updated_at": "..."
}
```

> `status`: `pending` → `running` → `done` / `failed`

---

### GET `/submissions/:id/grades`

ดูผลการตรวจ (เรียกหลังจาก job status = `done`)

**Auth required** (student ดูได้เฉพาะงานตัวเอง)

**Response 200**

```json
{
  "submission_id": 1,
  "status": "graded",
  "avg_level": 2.75,
  "display_level": 2.75,
  "approved": false,
  "final_level": null,
  "class_avg_level": 2.5,
  "grades": [
    {
      "id": 1,
      "criteria_name": "Correctness",
      "level": 3,
      "reasoning": "The code produces correct output for all test cases...",
      "feedback": "Consider handling edge cases such as empty input..."
    }
  ]
}
```

**หมายเหตุ:**

- `avg_level` — ค่าเฉลี่ย level จากทุก criteria (1.00–4.00, AAC&U scale)
- `display_level` — ค่าที่แสดง: ใช้ `final_level` ถ้าอาจารย์แก้ไว้ มิฉะนั้นใช้ `avg_level`
- `final_level` — avg level ที่อาจารย์กำหนดเอง (มีค่าเมื่อ action = `"edited"`)
- `class_avg_level` — ค่าเฉลี่ย level ของ submissions ทั้งหมดในงานเดียวกัน (เฉพาะ graded/approved)
- `level` ต่อ criteria: `1`=poor, `2`=fair, `3`=good, `4`=excellent

---

### GET `/submissions/:id/content`

ดูเนื้อหางานที่นิสิตส่ง — extract text จากไฟล์จริง

**Auth required | Role: teacher (เจ้าของวิชา)**

**Response 200**

```json
{ "type": "text", "content": "เนื้อหาที่ extract ได้...", "ext": ".pdf" }
```

> `type`: `"text"` | `"unsupported"` | `"empty"`
> `ext`: นามสกุลไฟล์ (`.pdf`, `.docx`, `.txt`) — ไม่มีถ้าเป็น content_text
> รองรับ PDF (text-based), DOCX, TXT — PDF แบบ scanned image จะ error

---

### GET `/submissions/:id`

ดู submission detail พร้อม job ล่าสุด

**Auth required** (student ดูได้เฉพาะงานตัวเอง)

**Response 200**

```json
{
  "submission": {
    "id": 1,
    "student_name": "นิสิต A",
    "assignment_title": "Lab 1",
    "status": "graded",
    "attempt": 1,
    "submitted_at": "..."
  },
  "latest_job": {
    "id": 1,
    "status": "done",
    "updated_at": "..."
  }
}
```

---

### GET `/submissions/:id/preview-prompt`

ดู prompt จริงที่จะส่งให้ AI สำหรับ submission นี้ (ใช้ตรวจสอบ rubric/criteria ก่อนสั่งตรวจ)

**Auth required | Role: teacher (เจ้าของวิชา)**

**Response 200**

```json
{
  "prompt": "You are a teacher grading a student assignment...\n\nRubric:\n...",
  "criteria_count": 4,
  "model": "qwen3-coder:30b",
  "calibration_count": 2,
  "correction_count": 1
}
```

> ใช้ข้อมูล rubric/override ล่าสุด ณ เวลาที่เรียก — ไม่ได้บันทึกไว้ล่วงหน้า
> `prompt` คือ string จริงที่ส่งให้ LLM ทุกครั้งที่กด "สั่งตรวจด้วย AI"
> `calibration_count` = จำนวน few-shot calibration examples ที่อาจารย์เพิ่มไว้ (0–3)
> `correction_count` = จำนวน auto correction examples จาก correction history (0–3)

---

### GET `/submissions/:id/audit`

ดูประวัติ approve/reject/edit ทั้งหมดของ submission (Audit Trail)

**Auth required | Role: teacher (เจ้าของวิชา)**

**Response 200**

```json
{
  "audit": [
    {
      "id": 1,
      "action": "approved",
      "note": "Good work",
      "final_level": null,
      "approved_at": "2026-03-24T10:30:00",
      "teacher_name": "อาจารย์ก"
    },
    {
      "id": 2,
      "action": "edited",
      "note": "ปรับลดเล็กน้อย",
      "final_level": 2.5,
      "approved_at": "2026-03-24T11:00:00",
      "teacher_name": "อาจารย์ก"
    }
  ]
}
```

> `action`: `"approved"` | `"rejected"` | `"edited"`
> `final_level` มีค่าเมื่อ action = `"edited"` — avg level (1.00–4.00) ที่อาจารย์กำหนดเอง

---

### GET `/assignments/:id/submissions`

Teacher ดู submissions ล่าสุดของแต่ละนิสิต (1 row ต่อคน) รวมนิสิตที่ยังไม่ส่งงาน

**Auth required | Role: teacher (เจ้าของวิชา)**

**Response 200**

```json
{
  "submissions": [
    {
      "id": 1,
      "student_id": 5,
      "student_name": "นิสิต A",
      "status": "graded",
      "attempt": 2,
      "job_status": "done",
      "avg_level": 2.75,
      "submitted_at": "..."
    },
    {
      "id": null,
      "student_id": 7,
      "student_name": "นิสิต B",
      "status": "not_submitted",
      "attempt": 0,
      "submitted_at": null,
      "avg_level": null,
      "job_status": null
    }
  ]
}
```

> นิสิตที่ยังไม่ส่งงานจะมี `id: null` และ `status: "not_submitted"`
> แต่ละนิสิตแสดงเฉพาะ submission ครั้งล่าสุด — ดู history ทุกครั้งได้จาก `GET /submissions/:id/history`

---

### GET `/assignments/:id/calibration-examples`

ดูตัวอย่าง few-shot calibration ที่อาจารย์บันทึกไว้สำหรับ Assignment นี้

**Auth required | Role: teacher (เจ้าของวิชา)**

**Response 200**

```json
{
  "examples": [
    {
      "submission_text": "นิสิตอธิบาย concept ถูกต้อง แต่ขาดตัวอย่างประกอบ",
      "level": 3,
      "reasoning": "ครบถ้วนในแง่ทฤษฎีแต่ไม่มี application"
    }
  ]
}
```

> `examples` เป็น array ว่าง `[]` ถ้ายังไม่มีการบันทึกตัวอย่าง

---

### PUT `/assignments/:id/calibration-examples`

บันทึก few-shot calibration examples สำหรับ Assignment — แทนที่ทั้งหมด

**Auth required | Role: teacher (เจ้าของวิชา)**

**Body**

```json
{
  "examples": [
    {
      "submission_text": "ข้อความงานตัวอย่าง (ย่อมาได้)",
      "level": 3,
      "reasoning": "อธิบายเหตุผลว่าทำไมให้ระดับนี้"
    }
  ]
}
```

> - `examples` ต้องเป็น array, สูงสุด **3 รายการ**
> - แต่ละรายการต้องมี `submission_text`, `level` (integer 1–4, AAC&U scale)
> - `reasoning` optional แต่แนะนำใส่เพื่อให้ AI เรียนรู้ได้ดีขึ้น
> - ส่ง `examples: []` เพื่อลบตัวอย่างทั้งหมด

**Response 200**

```json
{ "message": "Calibration examples saved" }
```

---

### POST `/assignments/:id/bulk-approve`

Approve ทุก submission ที่ status = `graded` ในงานนี้ทีเดียว

**Auth required | Role: teacher (เจ้าของวิชา)**

**Response 200**

```json
{ "approved_count": 12 }
```

> เฉพาะ submissions ที่ status = `graded` เท่านั้น — `approved`, `rejected`, `pending` จะถูกข้ามไป

---

### PUT `/submissions/:id/approve`

Teacher approve / reject / แก้คะแนน (ทีละคน)

**Auth required | Role: teacher (เจ้าของวิชา)**

**Body**

```json
{
  "action": "approved",
  "note": "Good work overall",
  "final_level": 3.0
}
```

> `action`: `"approved"` | `"rejected"` | `"edited"`
> `final_level`: optional (1.00–4.00) — ถ้าแก้ระดับเองให้ส่งมาด้วย เฉพาะ action = `"edited"`

**เงื่อนไข submission status:**

- เรียกได้เมื่อ status = `graded` หรือ `approved` (แก้ไขซ้ำได้หลัง approved แล้ว)
- ทุก action จะถูกบันทึกใน `grade_approvals` แยก row — เก็บ audit trail ครบ
- เมื่อ `action = "edited"` ระบบจะบันทึก `original_score` (avg level ของ AI ก่อนแก้) อัตโนมัติ — ใช้เป็น Auto Correction Example สำหรับ Human-in-the-Loop ระดับ 2

**approved field ใน GET `/submissions/:id/grades`:**

- `approved: true` เมื่อ action ล่าสุดเป็น `"approved"` หรือ `"edited"`
- `approved: false` เมื่อ action ล่าสุดเป็น `"rejected"` หรือยังไม่มี approval

**Response 200**

```json
{ "message": "Submission approved" }
```

---

### GET `/student/submissions`

นิสิตดูประวัติการส่งงานทั้งหมดของตัวเอง

**Auth required | Role: student**

**Response 200**

```json
{
  "submissions": [
    {
      "id": 10,
      "assignment_id": 5,
      "assignment_title": "Lab 7 — React Todo List",
      "course_name": "Web Frontend Development",
      "status": "approved",
      "attempt": 1,
      "avg_level": 3.5,
      "submitted_at": "2026-03-20T10:31:10"
    }
  ]
}
```

---

### GET `/submissions/:id/history`

ดูประวัติการส่งงานทั้งหมดของนิสิตคนเดียวกันสำหรับ assignment เดียวกัน (เรียงตาม attempt จากน้อยไปมาก)

**Auth required** (student ดูได้เฉพาะงานตัวเอง)

**Response 200**

```json
{
  "history": [
    {
      "id": 8,
      "attempt": 1,
      "status": "approved",
      "submitted_at": "2025-01-10T09:00:00",
      "avg_level": 2.5,
      "final_level": null
    },
    {
      "id": 10,
      "attempt": 2,
      "status": "approved",
      "submitted_at": "2025-01-12T11:30:00",
      "avg_level": 3.0,
      "final_level": null
    }
  ],
  "current_submission_id": 10
}
```

> `final_level` มีค่าเมื่ออาจารย์ใช้ action `"edited"` — แสดงแทน `avg_level`
> ใช้ `current_submission_id` เพื่อ highlight ครั้งที่กำลังดูอยู่

---

### GET `/submissions/:id/neighbors`

ดู submission ก่อนหน้า/ถัดไปในงานเดียวกัน (เรียงตามชื่อนิสิต) สำหรับ navigate ← →

**Auth required | Role: teacher (เจ้าของวิชา)**

**Response 200**

```json
{
  "prev": { "id": 3, "student_name": "นิสิต A" },
  "next": { "id": 7, "student_name": "นิสิต C" },
  "current_index": 2,
  "total": 15
}
```

> `prev` หรือ `next` จะเป็น `null` ถ้าไม่มี submission ก่อนหน้า/ถัดไป

---

### GET `/assignments/:id/grading-settings`

ดูการตั้งค่า LLM model parameters สำหรับงานนี้ (assignment-level override)

**Auth required | Role: teacher (เจ้าของวิชา)**

**Response 200**

```json
{
  "assignment_id": 1,
  "settings": {
    "ollama_temperature": null,
    "ollama_top_p": null,
    "ollama_repeat_penalty": null,
    "ollama_num_predict": null,
    "ollama_seed": null
  }
}
```

> ถ้าค่าใด = `null` → ใช้ global defaults สำหรับครูคนนี้ (หรือ global admin setting ถ้าครูไม่มี override)

---

### PUT `/assignments/:id/grading-settings`

สร้าง/อัปเดต assignment-level grading settings

**Auth required | Role: teacher (เจ้าของวิชา)**

**Body**

```json
{
  "ollama_temperature": 0.1,
  "ollama_top_p": 0.9,
  "ollama_repeat_penalty": 1.2,
  "ollama_num_predict": 2000,
  "ollama_seed": 42
}
```

> ส่งเฉพาะค่าที่ต้องการ override — ส่ง `null` หรือลบ field เพื่อใช้ defaults
>
> - `temperature`: 0–2 (lower = focused, higher = random)
> - `top_p`: 0–1 (nucleus sampling)
> - `repeat_penalty`: ≥0 (penalize repeated tokens)
> - `num_predict`: ≥1 (max tokens)
> - `seed`: ≥0 (for reproducibility, optional)

**Response 200**

```json
{
  "message": "Assignment grading settings saved",
  "settings": {
    "id": 5,
    "assignment_id": 1,
    "ollama_temperature": 0.1,
    ...
  }
}
```

---

### DELETE `/assignments/:id/grading-settings`

ลบ assignment-level grading settings (revert to global defaults)

**Auth required | Role: teacher (เจ้าของวิชา)**

**Response 200**

```json
{ "message": "Assignment grading settings deleted" }
```

---

## Rubric Levels

Rubric levels คือ descriptor ต่อระดับของแต่ละ criteria — ใส่ใน `criteria[].levels` เมื่อสร้าง/แก้ Rubric

ระบบใช้ **AAC&U VALUE Rubric scale 1–4** (ไม่มี score ต่อ level):

```json
"levels": [
  { "level": "excellent", "description": "ใช้ semantic tag ครบถ้วน ถูกต้องทุกจุด" },
  { "level": "good",      "description": "ถูกต้องเป็นส่วนใหญ่ มีข้อผิดพลาดเล็กน้อย" },
  { "level": "fair",      "description": "มีข้อผิดพลาดหลายจุด แต่โครงสร้างยังพอเข้าใจได้" },
  { "level": "poor",      "description": "โครงสร้างผิดพลาดมาก ไม่สื่อความหมาย" }
]
```

> `level` ต้องเป็นหนึ่งใน `"excellent"` | `"good"` | `"fair"` | `"poor"` เท่านั้น
> AI จะ output `level: 1-4` (poor=1, fair=2, good=3, excellent=4) ต่อ criteria
> ถ้ามี levels → LLM จะได้รับ descriptor แต่ละระดับใน prompt เพื่อให้ผลแม่นยำขึ้น

---

## Custom Rubric Override (Assignment Level)

Override คือ criteria พิเศษที่กำหนดเฉพาะ assignment นั้น — ถ้ามี override, grading จะใช้ override แทน rubric template

### GET `/assignments/:id/rubric-override`

ดู override ของงาน (null ถ้าไม่มี)

**Auth required**

**Response 200**

```json
{
  "override": {
    "id": 1,
    "assignment_id": 1,
    "created_at": "...",
    "criteria": [
      {
        "id": 1,
        "name": "ความถูกต้องของ HTML (Override)",
        "description": "เกณฑ์พิเศษสำหรับงานนี้",
        "order_index": 0,
        "levels": [{ "level": "excellent", "description": "สมบูรณ์แบบ" }]
      }
    ]
  }
}
```

> ถ้าไม่มี override: `{ "override": null }`

---

### PUT `/assignments/:id/rubric-override`

บันทึก/แก้ไข override (ส่ง `criteria: []` เพื่อลบ override)

**Auth required | Role: teacher (เจ้าของวิชา)**

**Body**

```json
{
  "criteria": [
    {
      "name": "เกณฑ์พิเศษ",
      "description": "คำอธิบาย",
      "levels": [
        { "level": "excellent", "description": "ดีเยี่ยม" },
        { "level": "good", "description": "ดี" },
        { "level": "fair", "description": "พอใช้" },
        { "level": "poor", "description": "ต้องปรับ" }
      ]
    }
  ]
}
```

> ส่ง `"criteria": []` เพื่อลบ override ออก (กลับไปใช้ rubric template)

**Response 200**

```json
{ "override": { ... } }
```

---

### POST `/assignments/:id/rubric-override/generate`

ร่าง criteria สำหรับ override ด้วย AI — **ไม่บันทึก** อาจารย์นำไปแก้แล้วกด `PUT /assignments/:id/rubric-override` เอง

**Auth required | Role: teacher (เจ้าของวิชา)**

**Body** — เหมือน `POST /rubrics/generate` (`task` ≥ 10 ตัวอักษร, `count` 1–8 default 4)

**Response 200** — คืนเฉพาะ `criteria` (โครงเดียวกับ `rubric.criteria` ของ `/rubrics/generate`)

```json
{ "criteria": [ { "name": "...", "min_score": 1, "max_score": 4, "levels": [ ... ] } ] }
```

**Error** — `400` task สั้นเกินไป · `404` ไม่ใช่เจ้าของงาน · `502` เรียก Ollama ไม่สำเร็จ

---

### GET `/assignments/:id/consistency`

ตรวจความสม่ำเสมอของ level — คำนวณ variance/outliers ต่อ criteria

**Auth required | Role: teacher (เจ้าของวิชา)**

**Response 200**

```json
{
  "total_graded": 5,
  "criteria_stats": [
    {
      "criteria_name": "Correctness",
      "count": 5,
      "mean": 2.8,
      "std": 0.9,
      "min": 1,
      "max": 4,
      "high_variance": true,
      "outliers": [
        {
          "submission_id": 3,
          "student_name": "สมชาย",
          "level": 1,
          "deviation": -1.8
        }
      ]
    }
  ],
  "submission_flags": [
    {
      "submission_id": 3,
      "student_name": "สมชาย",
      "flagged_criteria": [
        {
          "criteria_name": "Correctness",
          "level": 1,
          "mean": 2.8,
          "deviation": -1.8
        }
      ]
    }
  ]
}
```

**หมายเหตุ:**

- `mean`, `std`, `min`, `max` — คำนวณบน scale 1–4 (AAC&U)
- `high_variance` — `true` เมื่อ SD > 0.8 (บน scale 1–4)
- `outliers` — submissions ที่ level ห่างจาก mean เกิน 1.5 SD
- `submission_flags` — รวม outlier submissions จากทุก criteria (ไม่ซ้ำกัน)
- `total_graded: 0` → `criteria_stats: [], submission_flags: []`

---

## Appeals

### POST `/submissions/:id/appeal`

นิสิตส่ง appeal (ส่งซ้ำได้จนกว่า teacher จะ resolve)

**Auth required | Role: student (เจ้าของ submission)**

**Body**

```json
{ "reason": "ฉันคิดว่าคะแนนควรสูงกว่านี้เพราะ..." }
```

> ส่งได้เฉพาะเมื่อ submission status = `approved` เท่านั้น
> ถ้ามี appeal status = `pending` อยู่แล้ว จะไม่สามารถส่งซ้ำได้

**Response 201**

```json
{
  "appeal": {
    "id": 1,
    "submission_id": 1,
    "status": "pending",
    "reason": "...",
    "created_at": "..."
  }
}
```

---

### GET `/submissions/:id/appeal`

ดู appeal ล่าสุดของ submission

**Auth required**

**Response 200**

```json
{
  "appeal": {
    "id": 1,
    "status": "pending",
    "reason": "...",
    "teacher_response": null,
    "created_at": "..."
  }
}
```

> `status`: `"pending"` | `"resolved"`

---

### PUT `/appeals/:id`

Teacher ตอบกลับ appeal

**Auth required | Role: teacher**

**Body**

```json
{
  "status": "resolved",
  "teacher_response": "ตรวจสอบแล้ว คะแนนถูกต้องแล้ว เพราะ..."
}
```

> `status` ต้องเป็น `"resolved"` เสมอ

**Response 200**

```json
{ "appeal": { "id": 1, "status": "resolved", "teacher_response": "...", ... } }
```

---

### GET `/appeals`

Teacher ดู appeals ทั้งหมด (ทุก course ของตัวเอง)

**Auth required | Role: teacher**

**Response 200**

```json
{
  "appeals": [
    {
      "id": 1,
      "submission_id": 5,
      "student_name": "นิสิต A",
      "course_name": "Web Frontend Development",
      "assignment_title": "Lab 1",
      "reason": "...",
      "status": "pending",
      "created_at": "..."
    }
  ]
}
```

---

### GET `/appeals/count`

นับ pending appeals (สำหรับ navbar badge)

**Auth required | Role: teacher**

**Response 200**

```json
{ "count": 3 }
```

---

### GET `/assignments/:id/appeals`

ดู submission_ids ที่มี pending appeal (สำหรับ badge ใน submission list)

**Auth required | Role: teacher**

**Response 200**

```json
{ "pending_submission_ids": [5, 12, 18] }
```

---

## Settings

### GET `/settings/grading`

ดูค่า LLM parameters ปัจจุบัน (effective settings = per-teacher override + global fallback)

**Auth required | Role: teacher**

**Response 200**

```json
{
  "settings": {
    "ollama_url": "http://10.80.39.41:11941",
    "ollama_model": "qwen3-coder:30b",
    "max_submission_length": "8000",
    "ollama_temperature": "0.2",
    "ollama_top_p": "0.9",
    "ollama_repeat_penalty": "1.1",
    "ollama_seed": "0",
    "ollama_num_predict": "2048"
  },
  "global_keys": ["ollama_model"]
}
```

> ค่าที่ return คือ **effective settings** ของอาจารย์คนนั้น — ถ้าตั้งค่าเองไว้จะใช้ค่านั้น ถ้าไม่ได้ตั้งจะ fallback เป็น global default
> `global_keys` คือ key ที่อาจารย์แก้ไม่ได้ (กำหนดโดยระบบ) — frontend ใช้แสดงเป็น read-only

---

### PUT `/settings/grading`

แก้ไข LLM parameters (บันทึกเฉพาะของอาจารย์คนนี้ — ไม่กระทบอาจารย์คนอื่น)

**Auth required | Role: teacher**

**Body**

```json
{
  "settings": {
    "ollama_url": "http://localhost:11434",
    "max_submission_length": "16000",
    "ollama_temperature": "0.3",
    "ollama_top_p": "0.9",
    "ollama_repeat_penalty": "1.1",
    "ollama_seed": "42",
    "ollama_num_predict": "2048"
  }
}
```

> ส่งแค่ key ที่ต้องการแก้ได้ — key ที่ไม่อยู่ใน allowed list จะถูกข้าม
> `ollama_model` ไม่อยู่ใน allowed list — กำหนดโดย admin ระดับ global เท่านั้น
> `ollama_seed` ว่าง = สุ่มทุกครั้ง, ใส่ตัวเลข = คำตอบ reproducible
> `ollama_url` เปลี่ยนได้โดยไม่ต้อง restart server — อาจารย์แต่ละคนชี้ไปยัง Ollama server คนละตัวได้
> settings บันทึกแยกต่ออาจารย์แต่ละคน (per-teacher) ใน `grading_settings` table

**Response 200**

```json
{
  "settings": { ... },
  "global_keys": ["ollama_model"]
}
```

---

## Activity Logs

### GET `/logs`

ดู activity logs ของระบบ — บันทึกทุก action สำคัญ เช่น login, สร้างวิชา, ส่ง appeal ฯลฯ

**Auth required | Role: teacher**

**Query Parameters**

| Parameter | ประเภท  | Default | คำอธิบาย                                                 |
| --------- | ------- | ------- | -------------------------------------------------------- |
| `limit`   | integer | `100`   | จำนวน log สูงสุดที่ต้องการ (max 500)                     |
| `action`  | string  | —       | กรอง log เฉพาะ action นั้น เช่น `login`, `course_create` |
| `userId`  | integer | —       | กรอง log เฉพาะ user คนนั้น                               |

**Response 200**

```json
{
  "logs": [
    {
      "id": 1,
      "user_id": 2,
      "user_name": "อาจารย์ก",
      "username": "teacher01",
      "user_role": "teacher",
      "action": "login",
      "entity": "user",
      "entity_id": 2,
      "detail": null,
      "ip": "127.0.0.1",
      "created_at": "2026-03-25T10:00:00"
    }
  ]
}
```

**action values ที่ระบบบันทึก:**

| action                 | trigger                            |
| ---------------------- | ---------------------------------- |
| `register`             | `POST /auth/register` สำเร็จ       |
| `login`                | `POST /auth/login` สำเร็จ          |
| `change_password`      | `PUT /auth/change-password` สำเร็จ |
| `appeal_submit`        | นิสิตส่ง appeal                    |
| `appeal_resolve`       | อาจารย์ตอบกลับ appeal              |
| `course_create`        | อาจารย์สร้างวิชาใหม่               |
| `course_delete`        | อาจารย์ลบวิชา                      |
| `reset_password`       | อาจารย์ reset รหัสผ่านนิสิต        |
| `import_students`      | อาจารย์ import นิสิตเข้าวิชา       |
| `assignment_create`    | อาจารย์สร้างงาน                    |
| `grading_done`         | grading job เสร็จสมบูรณ์           |
| `admin_create_teacher` | admin สร้าง teacher account        |
| `admin_reset_password` | admin reset รหัสผ่าน teacher       |
| `admin_delete_teacher` | admin ลบ teacher account           |

> `detail` เป็น JSON object หรือ `null` — เก็บข้อมูลเพิ่มเติมตาม action เช่น `{ "course_id": 3, "title": "Lab 1" }`
> `entity` คือ resource ที่เกี่ยวข้อง เช่น `"user"`, `"course"`, `"assignment"`, `"submission"`
> `entity_id` คือ id ของ resource นั้น

**Error Responses**
| Status | เหตุ |
|--------|------|
| 401 | ไม่ได้ login |
| 403 | ไม่ใช่ teacher |

---

---

## Admin

> **Auth required | Role: admin** — ทุก endpoint ในหมวดนี้

### GET `/admin/stats`

ภาพรวมระบบทั้งหมด

**Response 200**

```json
{
  "teachers": 5,
  "students": 312,
  "courses": 14,
  "submissions": 1840,
  "pendingGrading": 3,
  "pendingApproval": 12
}
```

> `courses` นับเฉพาะวิชาที่ `archived = 0`
> `pendingGrading` = submissions ที่ status = 'pending'
> `pendingApproval` = submissions ที่ status = 'graded' (รออาจารย์ approve)

---

### GET `/admin/users`

ดูรายชื่อ teacher ทั้งหมด

**Response 200**

```json
{
  "teachers": [
    {
      "id": 2,
      "name": "อาจารย์ก",
      "username": "teacher01",
      "course_count": 3,
      "created_at": "..."
    }
  ]
}
```

---

### POST `/admin/users`

สร้าง teacher account ใหม่

**Body**

```json
{ "name": "อาจารย์ข", "username": "teacher02", "password": "pass1234" }
```

> `password` ต้องมีอย่างน้อย 6 ตัวอักษร

**Response 201**

```json
{
  "teacher": {
    "id": 3,
    "name": "อาจารย์ข",
    "username": "teacher02",
    "role": "teacher"
  }
}
```

**Error 409** — username ซ้ำ

---

### PUT `/admin/users/:id/reset-password`

Reset รหัสผ่าน teacher

**Body**

```json
{ "password": "newpass1234" }
```

**Response 200**

```json
{ "message": "Reset password สำเร็จ" }
```

---

### DELETE `/admin/users/:id`

ลบ teacher account (cascade ลบวิชาและข้อมูลทั้งหมดของ teacher คนนั้น)

**Response 200**

```json
{ "message": "ลบ teacher สำเร็จ" }
```

---

### สร้าง admin account แรก

ทำผ่าน seed script (ต้องมี server ปิดอยู่หรือ DB ไม่ lock):

```bash
node src/db/seed-admin.js <username> <password> <name>
# ตัวอย่าง:
node src/db/seed-admin.js admin Admin1234 "ผู้ดูแลระบบ"
```

---

### GET `/admin/backup/db`

ดาวน์โหลด SQLite database backup (Admin only)

**Response:** ไฟล์ SQLite (blob) — `application/octet-stream`

**Filename:** `ai-feedback-backup-{timestamp}.db`

**Status 200**

```
[binary SQLite database file]
```

> เฉพาะ admin เท่านั้น (role = admin)
> ไฟล์ที่ส่งคืนเป็น snapshot ของ database ทั้งหมด
> สามารถ restore ได้ทีหลัง (`docker cp restore-file.db container:/path/to/db`)

---

### GET `/admin/settings/grading`

ดูการตั้งค่า Ollama ระดับ global (admin-level)

**Response 200**

```json
{
  "settings": {
    "ollama_url": "http://10.80.39.41:11941",
    "ollama_model": "qwen3-coder:30b",
    "ollama_temperature": "0.2",
    "ollama_top_p": "0.9",
    "ollama_repeat_penalty": "1.1",
    "ollama_num_predict": "2048",
    "ollama_seed": "0"
  }
}
```

> ค่า default ทั้งระบบ — อาจารย์แต่ละคนสามารถ override ได้ผ่าน `/settings/grading`

---

### PUT `/admin/settings/grading`

แก้ไขการตั้งค่า Ollama ระดับ global (มีผลต่อทั้งระบบ)

**Body**

```json
{
  "ollama_url": "http://10.80.39.41:11941",
  "ollama_model": "qwen3-coder:30b",
  "ollama_temperature": "0.2",
  "ollama_top_p": "0.9",
  "ollama_repeat_penalty": "1.1",
  "ollama_num_predict": "2048",
  "ollama_seed": "0"
}
```

> ส่งแค่ key ที่ต้องการแก้ได้ — key อื่นไม่เปลี่ยน
> `ollama_model` — เฉพาะ admin ตั้งได้ (อาจารย์ไม่มี override)
> `ollama_url` — อาจารย์สามารถ override ได้ด้วยค่าส่วนตัว
> ส่วนอื่น (temperature, top_p, repeat_penalty, num_predict, seed) — อาจารย์และ assignment สามารถ override ได้

**Response 200**

```json
{
  "message": "Global grading settings updated",
  "settings": {
    "ollama_url": "http://10.80.39.41:11941",
    "ollama_model": "qwen3-coder:30b",
    "ollama_temperature": "0.2",
    "ollama_top_p": "0.9",
    "ollama_repeat_penalty": "1.1",
    "ollama_num_predict": "2048",
    "ollama_seed": "0"
  }
}
```

---

## Coming Soon

| Endpoint                           | Description                                                  |
| ---------------------------------- | ------------------------------------------------------------ |
| `POST /assignments/:id/bulk-grade` | Bulk Grade — สั่งตรวจทุก submissions ของ assignment พร้อมกัน |
