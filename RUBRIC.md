# Rubric System — AAC&U VALUE Scale

ระบบใช้ **Analytic Rubric** ตามแนวทาง AAC&U VALUE Rubric — แต่ละเกณฑ์ (criteria) ประเมินแยกกัน และให้คะแนนเป็น **level 1–4** เท่านั้น

---

## Scale 1–4

| Level | ชื่อ | ความหมาย |
|---|---|---|
| 4 | Excellent (ดีเยี่ยม) | ผลงานแสดงให้เห็นถึงความเข้าใจอย่างลึกซึ้งและครบถ้วน |
| 3 | Good (ดี) | ผลงานถูกต้องเป็นส่วนใหญ่ มีข้อบกพร่องเล็กน้อย |
| 2 | Fair (พอใช้) | ผลงานแสดงความเข้าใจเบื้องต้น แต่มีข้อบกพร่องหลายจุด |
| 1 | Poor (ต้องปรับปรุง) | ผลงานไม่ตรงตามเกณฑ์ ต้องปรับปรุงอย่างมาก |

---

## โครงสร้าง Rubric

```
Rubric Template
└── Criteria 1 (ทุกเกณฑ์มีน้ำหนักเท่ากัน)
    ├── Level 4 — Excellent: [คำอธิบายพฤติกรรม]
    ├── Level 3 — Good: [คำอธิบายพฤติกรรม]
    ├── Level 2 — Fair: [คำอธิบายพฤติกรรม]
    └── Level 1 — Poor: [คำอธิบายพฤติกรรม]
└── Criteria 2
    └── ...
```

- **ไม่มี max_score** ต่อ criteria — ทุก criteria มี min = 1, max = 4
- **ไม่มี weight** — ทุก criteria มีน้ำหนักเท่ากัน
- **ไม่มี level 0** — scale เริ่มจาก 1 ถึง 4
- **avg level** = ผลรวม level ทุก criteria ÷ จำนวน criteria (1.00–4.00)

---

## การออกแบบ Level Description

Level description ที่ดีควรระบุ **พฤติกรรมที่วัดได้** ไม่ใช่แค่คำคุณศัพท์

❌ ไม่ดี:
```
Level 4: ดีมาก ครบถ้วน
Level 3: ดี
```

✅ ดี:
```
Level 4: อธิบาย concept ครบถ้วน พร้อมตัวอย่างที่ชัดเจน และเชื่อมโยงกับ context ได้
Level 3: อธิบายถูกต้องแต่ขาดตัวอย่างหรือรายละเอียดบางส่วน
Level 2: อธิบาย concept ได้บางส่วน มีความเข้าใจผิดในจุดสำคัญ
Level 1: ไม่สามารถอธิบาย concept ได้ หรืออธิบายผิดพลาดอย่างมีนัยสำคัญ
```

---

## ผลการประเมิน

AI จะ output `level` (1–4) ต่อ criteria แล้วระบบคำนวณ:

```
avg_level = sum(level ทุก criteria) / จำนวน criteria
```

ตัวอย่าง (4 criteria):
```
Correctness:  level 3
Structure:    level 4
Language:     level 2
Citation:     level 3

avg_level = (3+4+2+3) / 4 = 3.00 → "ดี"
```

---

## Auto-approve Threshold

กำหนดเป็น avg level (ไม่ใช่ %) เช่น:
- `3.0` → auto-approve ถ้า avg level ≥ 3.0 (ดี)
- `2.5` → auto-approve ถ้า avg level ≥ 2.5
- ไม่กำหนด (null) → ทุก submission รออาจารย์ review

---

## Custom Override (Assignment Level)

อาจารย์สามารถกำหนด criteria พิเศษสำหรับ assignment ใดงานหนึ่งได้ โดยใช้ **Override** แทน template — โครงสร้างเหมือนกัน (level 1–4 เท่ากัน)

---

## ร่าง Rubric ด้วย AI

พิมพ์คำอธิบายงาน ระบุจำนวนเกณฑ์ (1–8) แล้วกด **ร่างด้วย AI** — ระบบเรียก Ollama สร้าง draft:

- เกณฑ์เป็นภาษาไทยเสมอ
- ทุกเกณฑ์มี 4 ระดับ (score 4→1) พร้อม label มาตรฐานและคำอธิบายรายระดับ
- prompt สั่งให้เขียนคำอธิบายระดับแบบ **ตรวจสอบได้จากงานจริง** และระดับติดกันแยกออกจากกันชัด เพื่อให้ AI grader จับคู่คะแนนได้แม่น
- เป็น **draft เท่านั้น** — ยังไม่บันทึกจนกว่าอาจารย์จะกดบันทึก; แก้ได้ทุกช่องก่อนบันทึก
- ใช้ได้ทั้ง Rubric Template (`POST /rubrics/generate`) และ Override (`POST /assignments/:id/rubric-override/generate`)
- กล่องร่างแสดงเฉพาะตอนสร้างใหม่ — ถ้าอยากร่างใหม่ให้ลบ rubric/override เดิมก่อน
