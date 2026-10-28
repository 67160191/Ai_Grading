// node src/services/rubricGen.test.js
import assert from "node:assert";
import { _sanitize } from "./rubricGen.js";

// AI ตอบครบ
let r = _sanitize(
  {
    name: "Python Rubric",
    description: "ประเมินโค้ด",
    criteria: [
      {
        name: "ความถูกต้อง",
        description: "โปรแกรมทำงานถูก",
        levels: [
          { score: 4, description: "ถูกทุกกรณี" },
          { score: 3, description: "ถูกเกือบหมด" },
          { score: 2, description: "ถูกบางส่วน" },
          { score: 1, description: "ผิดเป็นส่วนใหญ่" },
        ],
      },
    ],
  },
  2,
);
assert.equal(r.criteria.length, 1);
assert.equal(r.criteria[0].levels.length, 4);
assert.deepEqual(
  r.criteria[0].levels.map((l) => l.score),
  [4, 3, 2, 1],
);
assert.equal(r.criteria[0].levels[0].label, "ดีมาก");
assert.equal(r.criteria[0].levels[0].description, "ถูกทุกกรณี");
assert.equal(r.criteria[0].min_score, 1);
assert.equal(r.criteria[0].max_score, 4);

// AI ตอบ levels ไม่ครบ / ไม่มี → ยังได้ 4 ระดับ description ว่าง
r = _sanitize({ criteria: [{ name: "X", levels: [{ score: 4, description: "ดี" }] }] }, 4);
assert.equal(r.criteria[0].levels.length, 4);
assert.equal(r.criteria[0].levels[0].description, "ดี");
assert.equal(r.criteria[0].levels[3].description, "");

// count จำกัดจำนวนเกณฑ์
r = _sanitize(
  { criteria: [{ name: "a" }, { name: "b" }, { name: "c" }] },
  2,
);
assert.equal(r.criteria.length, 2);

// criteria ที่ไม่มี name ถูกตัดทิ้ง
r = _sanitize({ criteria: [{ description: "no name" }, { name: "ok" }] }, 4);
assert.equal(r.criteria.length, 1);
assert.equal(r.criteria[0].name, "ok");

console.log("ok");
