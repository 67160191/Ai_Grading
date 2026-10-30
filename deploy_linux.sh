#!/usr/bin/env bash
# ==============================================================================
# Script สำหรับ Deploy ระบบ AI-Feedback / ระบบสอบ บน Linux Server
# รองรับการรันสอบพร้อมกัน 106+ คน
# ==============================================================================
set -e

echo "=========================================================="
echo "🚀 กำลังเริ่มต้น Deployment ระบบสอบ AI-Feedback บน Linux..."
echo "=========================================================="

# 1. ตรวจสอบการติดตั้ง Docker & Docker Compose
if ! command -v docker &> /dev/null; then
    echo "❌ ไม่พบ Docker ในระบบ กรุณาติดตั้ง Docker ก่อน"
    echo "   Ubuntu/Debian: sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2"
    exit 1
fi

DOCKER_COMPOSE_CMD=""
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker-compose"
else
    echo "❌ ไม่พบ docker compose หรือ docker-compose กรุณาติดตั้ง Docker Compose Plugin"
    exit 1
fi

# 2. ตั้งค่า Permission โฟลเดอร์ data และ uploads เพื่อให้ Docker เขียน SQLite WAL ได้ไม่ติดสิทธิ์
echo "📁 ตรวจสอบและตั้งค่า Permission ของ backend/data และ backend/src/uploads..."
mkdir -p backend/data
mkdir -p backend/src/uploads
chmod -R 777 backend/data backend/src/uploads

# 3. ตรวจสอบไฟล์ Database และ .env
if [ ! -f "backend/data/app.db" ]; then
    if [ -f "database_backup/app.db" ]; then
        echo "⚠️ ไม่พบ backend/data/app.db กำลังกู้คืนจาก database_backup/app.db..."
        cp database_backup/app.db backend/data/app.db
        chmod 777 backend/data/app.db
    else
        echo "⚠️ คำเตือน: ไม่พบ backend/data/app.db ระบบจะสร้าง Database ใหม่"
    fi
fi

if [ ! -f "backend/.env" ]; then
    if [ -f "backend/.env.example" ]; then
        echo "⚠️ ไม่พบ backend/.env กำลังคัดลอกตัวอย่างจาก backend/.env.example..."
        cp backend/.env.example backend/.env
    fi
fi

# 4. สั่งหยุด container เก่า (ถ้ามี) แล้วสั่ง build & start
echo "🐳 กำลัง Build และ Start Docker Containers..."
$DOCKER_COMPOSE_CMD down --remove-orphans 2>/dev/null || true
$DOCKER_COMPOSE_CMD up -d --build

# 5. รอให้ Service พร้อมทำงาน
echo "⏳ รอระบบเริ่มทำงาน (5 วินาที)..."
sleep 5

# 6. ค้นหา IP ของเครื่อง Linux เพื่อแสดง URL สำหรับนิสิต
SERVER_IPS=$(hostname -I 2>/dev/null || ip -4 addr show | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | grep -v '127.0.0.1' || echo "localhost")

echo ""
echo "=========================================================="
echo "✅ ระบบพร้อมใช้งานเรียบร้อยแล้ว!"
echo "=========================================================="
echo "🌐 URL สำหรับเข้าใช้งานในห้องสอบ (Port 80):"
for ip in $SERVER_IPS; do
    echo "   👉 http://$ip"
done
echo ""
echo "🔑 ข้อมูลบัญชีผู้ใช้ในระบบ:"
echo "   1. ผู้ดูแลระบบ (Admin):"
echo "      - Username: admin"
echo "      - Password: admin1234"
echo ""
echo "   2. อาจารย์ (Teacher):"
echo "      - Username: kubola (อ.คนึงนิจ)"
echo "      - Password: kubola"
echo ""
echo "   3. นิสิตสอบ (106 คน):"
echo "      - Username: 69160001 ถึง 69160106"
echo "      - Password: รหัสนิสิตเดียวกัน (เช่น 69160001 / 69160001)"
echo "      - ลงทะเบียนเข้าวิชา Test เรียบร้อยแล้วทุกคน"
echo ""
echo "⚡ ระบบ Load Balancing & Concurrency:"
echo "   - Nginx Upstream Keepalive & Gzip Asset Optimization: เปิดใช้งาน"
echo "   - Node.js Multi-Core Cluster Workers: เปิดใช้งาน (กระจายโหลดครบทุก Core)"
echo "   - SQLite WAL High-Concurrency Mode: เปิดใช้งาน"
echo ""
echo "📋 คำสั่งที่เป็นประโยชน์:"
echo "   - ดูสถานะ Container:    $DOCKER_COMPOSE_CMD ps"
echo "   - ดู Log การทำงาน:       $DOCKER_COMPOSE_CMD logs -f"
echo "   - หยุดการทำงาน:         $DOCKER_COMPOSE_CMD down"
echo "   - รีสตาร์ทระบบ:         $DOCKER_COMPOSE_CMD restart"
echo "=========================================================="

