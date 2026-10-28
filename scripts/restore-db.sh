#!/bin/sh
# Restore SQLite DB จากไฟล์ backup — รันบน server เท่านั้น (SSH เข้าไปรันเอง)
#
# ใช้งาน:
#   ./scripts/restore-db.sh backup_20260714.db [container_name]
#
# container_name default = ai-feedback-backend-1

set -e

BACKUP_FILE="$1"
CONTAINER="${2:-ai-feedback-backend-1}"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup-file.db> [container_name]"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ไม่พบไฟล์: $BACKUP_FILE"
  exit 1
fi

SAFETY_COPY="./before_restore_$(date +%Y%m%d_%H%M%S).db"

echo "1/5 หยุด backend container..."
docker compose stop backend

echo "2/5 สำรอง DB ปัจจุบันไว้ที่ $SAFETY_COPY (กันพลาด)..."
docker cp "${CONTAINER}:/app/data/app.db" "$SAFETY_COPY" 2>/dev/null || echo "  (ข้าม — ไม่พบ app.db เดิม)"

echo "3/5 copy $BACKUP_FILE เข้า container แทน app.db..."
docker cp "$BACKUP_FILE" "${CONTAINER}:/app/data/app.db"

echo "4/5 ลบไฟล์ WAL/SHM เก่า..."
docker start "$CONTAINER" >/dev/null 2>&1 || true
docker exec "$CONTAINER" sh -c "rm -f /app/data/app.db-wal /app/data/app.db-shm" 2>/dev/null || true
docker compose stop backend

echo "5/5 เริ่ม backend ใหม่..."
docker compose start backend

echo ""
echo "Restore เสร็จแล้ว. เช็ค log ด้วย: docker compose logs -f backend"
echo "ไฟล์ก่อน restore ถูกเก็บไว้ที่: $SAFETY_COPY"
echo ""
echo "หมายเหตุ: backup นี้ไม่รวมไฟล์อัปโหลดของนักเรียน (backend/uploads/) — ต้อง restore แยกถ้าจำเป็น"
