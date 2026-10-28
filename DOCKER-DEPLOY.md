# Docker Deployment Guide

ระบบนี้ deploy ด้วย Docker Compose โดยมี 2 container:

## สารบัญ

1. [สิ่งที่ต้องมีก่อน](#สิ่งที่ต้องมีก่อน)
2. [โครงสร้างไฟล์ที่เกี่ยวข้อง](#โครงสร้างไฟล์ที่เกี่ยวข้อง)
3. [ขั้นตอน Deploy](#ขั้นตอน-deploy)
4. [Ollama: เชื่อมต่ออย่างไร](#ollama-เชื่อมต่ออย่างไร)
5. [ข้อมูล (Database + Uploads) อยู่ที่ไหน](#ข้อมูล-database--uploads-อยู่ที่ไหน)
6. [คำสั่งที่ใช้บ่อย](#คำสั่งที่ใช้บ่อย)
7. [Deploy บนเซิร์ฟเวอร์ Linux](#deploy-บนเซิร์ฟเวอร์-linux)
8. [Versioning](#versioning)
9. [แก้ปัญหาเบื้องต้น](#แก้ปัญหาเบื้องต้น)

---

- **backend** — Node.js API server (port 3000 ภายใน)
- **frontend** — React app build เสร็จแล้วเสิร์ฟผ่าน Nginx (port 80)

Nginx ทำหน้าที่เป็น reverse proxy: request `/api/*` → backend, อื่นๆ → React SPA

---

## สิ่งที่ต้องมีก่อน

| สิ่ง                                         | หมายเหตุ                                         |
| -------------------------------------------- | ------------------------------------------------ |
| Docker Desktop (หรือ Docker Engine บน Linux) | version 24+ แนะนำ                                |
| Ollama instance                              | รันแยกบนเครื่องโฮสต์หรือเซิร์ฟเวอร์อื่น          |
| Model ที่ pull ไว้แล้วใน Ollama              | เช่น `qwen3-coder:30b` หรือ model อื่นตามต้องการ |

---

## โครงสร้างไฟล์ที่เกี่ยวข้อง

```
AI-Feedback/
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── .env            ← สร้างจาก .env.example
│   ├── .env.example
│   └── src/
└── frontend/
    ├── Dockerfile
    └── nginx.conf
```

---

## ขั้นตอน Deploy

### 1. Clone หรือเตรียม source code

```bash
git clone <repo-url>
cd AI-Feedback
```

### 2. สร้างไฟล์ `.env` สำหรับ backend

```bash
cp backend/.env.example backend/.env
```

แล้วแก้ค่าใน `backend/.env`:

```env
JWT_SECRET=ใส่ random string ยาวอย่างน้อย 32 ตัวอักษร
JWT_EXPIRES_IN=7d
OLLAMA_URL=http://<IP หรือ hostname ของ Ollama>:11941
OLLAMA_MODEL=qwen3-coder:30b
MAX_FILE_SIZE_MB=20
MAX_FEEDBACK_LENGTH=2000
```

> **สำคัญ:** `JWT_SECRET` ต้องเป็น string สุ่มที่ไม่ซ้ำกัน ห้ามใช้ค่า default
>
> สร้างได้ด้วย: `openssl rand -base64 32`

### 3. Build และ Start containers

```bash
docker compose up -d --build
```

- `-d` = รันเป็น background (detached)
- `--build` = build image ใหม่ทุกครั้ง (จำเป็นเมื่อ code เปลี่ยน)

### 4. ตรวจสอบว่ารันอยู่

```bash
docker compose ps
```

ควรเห็น `backend` และ `frontend` สถานะ `Up`

### 5. เปิดระบบ

เปิด browser ไปที่ `http://localhost` (หรือ IP ของเซิร์ฟเวอร์)

---

## Ollama: เชื่อมต่ออย่างไร

Ollama **ไม่ได้รันใน Docker** ของโปรเจกนี้ — รันแยกต่างหาก

### กรณี Ollama รันบนเครื่องเดียวกัน (localhost)

Docker container ไม่สามารถใช้ `localhost` เพื่อหาเครื่องโฮสต์ได้โดยตรง ต้องใช้:

- **Mac/Windows:** `http://host.docker.internal:11434`
- **Linux:** `http://172.17.0.1:11434` (หรือ IP จริงของ network interface)

```env
OLLAMA_URL=http://host.docker.internal:11434
```

### กรณี Ollama รันบนเซิร์ฟเวอร์อื่น

```env
OLLAMA_URL=http://10.80.39.41:11941
```

> ตรวจสอบว่า firewall เปิด port 11434 ให้ container เข้าถึงได้

---

## ข้อมูล (Database + Uploads) อยู่ที่ไหน

ข้อมูลเก็บใน **Docker named volumes** — ไม่หายเมื่อ restart หรือ rebuild:

| Volume            | เก็บอะไร                      |
| ----------------- | ----------------------------- |
| `backend_data`    | SQLite database (`cowork.db`) |
| `backend_uploads` | ไฟล์งานที่นิสิต submit        |

### Backup ข้อมูล

```bash
# ดูว่า volume อยู่ที่ไหน
docker volume inspect ai-feedback_backend_data

# Copy database ออกมา
docker compose cp backend:/app/data/app.db ./backup-$(date +%Y%m%d).db

# Copy uploads ออกมา
docker compose cp backend:/app/uploads ./backup-uploads-$(date +%Y%m%d)
```

### Restore ข้อมูล

**ไม่มี restore ผ่าน UI** — ต้อง SSH เข้า server แล้วรันเองเท่านั้น (ป้องกันการ restore พลาดผ่านหน้าเว็บ)

#### วิธีที่แนะนำ: ใช้ script `scripts/restore-db.sh`

```bash
./scripts/restore-db.sh ai-feedback-backup-20260325_143022.db
```

Script จะ: หยุด backend → สำรอง DB ปัจจุบันไว้กันพลาด → copy ไฟล์ backup เข้าไปแทน `app.db` → ลบ `app.db-wal`/`app.db-shm` เก่า (สำคัญ เพราะ DB ใช้ WAL mode ถ้าไม่ลบข้อมูลอาจไม่ sync) → เริ่ม backend ใหม่

ไฟล์ backup ได้จากการดาวน์โหลดผ่าน Admin UI หรือ:
```bash
curl -H "Authorization: Bearer <admin_token>" \
  http://localhost:3000/api/admin/backup/db \
  -o ai-feedback-backup-$(date +%Y%m%d_%H%M%S).db
```

#### วิธี manual (ถ้าไม่ใช้ script)

```bash
# 1. Stop backend ก่อนเสมอ (DB ใช้ WAL mode ห้าม copy ทับตอน process ยังรัน)
docker compose stop backend

# 2. (แนะนำ) สำรอง DB ปัจจุบันไว้กันพลาด
docker compose cp backend:/app/data/app.db ./before_restore_$(date +%Y%m%d_%H%M%S).db

# 3. Copy ไฟล์ backup เข้าไปแทน
docker compose cp ./ai-feedback-backup-20260325_143022.db backend:/app/data/app.db

# 4. ลบไฟล์ WAL/SHM เก่า (สำคัญ — ไม่งั้น SQLite อาจอ่านข้อมูลเก่าที่ค้างใน WAL แทนไฟล์ที่เพิ่ง restore)
docker compose start backend
docker exec ai-feedback-backend-1 sh -c "rm -f /app/data/app.db-wal /app/data/app.db-shm"
docker compose restart backend
```

> **หมายเหตุ:** backup database ไม่รวมไฟล์อัปโหลดของนิสิต (`backend/uploads/`) — ถ้าต้อง restore ให้ครบต้อง copy โฟลเดอร์ uploads กลับเข้าไปด้วย (ดูหัวข้อ Backup ข้อมูลด้านบน)

---

## คำสั่งที่ใช้บ่อย

```bash
# Start (ถ้า container มีอยู่แล้ว)
docker compose up -d

# Stop
docker compose down

# Rebuild หลังแก้ code
docker compose up -d --build

# ดู logs แบบ realtime
docker compose logs -f

# ดู logs เฉพาะ backend
docker compose logs -f backend

# เข้าไปใน container (debug)
docker compose exec backend sh
```

---

## Deploy บนเซิร์ฟเวอร์ Linux

### ขั้นตอน Deploy

#### 1. SSH เข้า Linux Server

```bash
ssh user@your-server.com
cd /opt/app  # หรือตำแหน่งที่ต้องการ
```

#### 2. Clone หรือ Pull Code

```bash
# Clone ครั้งแรก
git clone <repo-url> AI-Feedback-v2.1
cd AI-Feedback-v2.1

# หรือ pull code ล่าสุด
git pull origin main
```

#### 3. ตรวจสอบและแก้ไข `.env` สำหรับ Production

**⚠️ IMPORTANT: ต้องเปลี่ยน production values:**

```bash
nano backend/.env
```

**ตรวจสอบค่าต่อไปนี้:**

| Variable | Dev (ตัวอย่าง) | Production | หมายเหตุ |
|----------|-----------|-----------|---------|
| `JWT_SECRET` | *(สุ่มในเครื่อง dev)* | ❌ **ต้องเปลี่ยน** | สร้าง random: `openssl rand -base64 32` — ห้าม commit ค่าจริงลง git |
| `FRONTEND_URL` | `http://localhost:8800` | `https://your-domain.com` | เปลี่ยน CORS origin |
| `ADMIN_USERNAME` | `admin` | `prod_admin_2026` | ❌ **ห้าม** ชื่อ default |
| `ADMIN_PASSWORD` | *(สุ่มในเครื่อง dev)* | ตั้งรหัสแข็งแรงใหม่ | Minimum 16 chars — ห้าม commit ค่าจริงลง git |
| `OLLAMA_URL` | ตาม internal network ของทีม | ✅ ตรวจสอบ | ต้อง reachable จากเซิร์ฟเวอร์ |
| `OLLAMA_MODEL` | `qwen3-coder:30b` | ✅ ตรวจสอบ | ต้องมีใน Ollama production |

**ตัวอย่าง Production `.env` (ค่าเป็น placeholder — ต้องสร้างค่าจริงเอง ห้ามคัดลอกไปใช้ตรงๆ):**

```env
JWT_SECRET=<generate with: openssl rand -base64 32>
JWT_EXPIRES_IN=7d

FRONTEND_URL=https://ai-feedback.yourdomain.com
ADMIN_USERNAME=prod_admin_2026
ADMIN_PASSWORD=<generate a strong random password>

OLLAMA_URL=http://gpu-server.internal:11941
OLLAMA_MODEL=qwen3-coder:30b

MAX_FILE_SIZE_MB=20
MAX_FEEDBACK_LENGTH=2000
```

#### 4. เปิด Port ที่ Firewall

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp   # ถ้าจะใช้ HTTPS
sudo ufw enable          # เปิด UFW (ถ้ายังไม่เปิด)
```

#### 5. ตั้ง Docker Auto-Start

`docker-compose.yml` ใช้ `restart: unless-stopped` — container จะ start อัตโนมัติเมื่อ reboot

```bash
sudo systemctl enable docker
sudo systemctl start docker
```

#### 6. Deploy Application

```bash
docker compose up -d --build
```

**ตรวจสอบการ deploy:**

```bash
docker compose ps           # ดูสถานะ container
docker compose logs -f      # ดู logs realtime
docker compose logs backend # ดู logs เฉพาะ backend
```

#### 7. ตั้ค HTTPS (สำคัญสำหรับ Production)

**วิธี A: ใช้ Caddy (แนะนำ)**

```bash
# ติดตั้ง Caddy
sudo apt update && sudo apt install -y caddy

# สร้าง Caddyfile
sudo nano /etc/caddy/Caddyfile
```

**ตัวอย่าง Caddyfile:**

```caddy
your-domain.com {
    reverse_proxy localhost:80 {
        header_uri -Authorization
    }
}

# ถ้าต้องการ redirect HTTP → HTTPS (auto)
your-domain.com www.your-domain.com {
    reverse_proxy localhost:80
}
```

```bash
# Restart Caddy (ออก SSL cert อัตโนมัติ via Let's Encrypt)
sudo systemctl restart caddy
sudo systemctl enable caddy
```

**วิธี B: ใช้ Nginx + Certbot**

```bash
# ติดตั้ง Nginx
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx

# ตั้ค Nginx config
sudo nano /etc/nginx/sites-available/default
```

**ตัวอย่าง Nginx config:**

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    
    location / {
        proxy_pass http://localhost:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
# Enable Nginx
sudo systemctl enable nginx
sudo systemctl start nginx

# ออก SSL cert
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

#### 8. ตรวจสอบว่าระบบทำงาน

```bash
# เข้า http://your-domain.com (หรือ https://)
curl https://your-domain.com/api/health

# ควรได้ response:
# { "status": "ok", "version": "1.2.1", "timestamp": "..." }
```

### Monitoring & Maintenance

**ดู logs realtime:**

```bash
docker compose logs -f backend
docker compose logs -f frontend
```

**Backup database:**

```bash
docker compose cp backend:/app/data/app.db ./backup-$(date +%Y%m%d).db
```

**Restart services:**

```bash
docker compose restart       # restart ทั้งหมด
docker compose restart backend  # restart เฉพาะ backend
```

**Update code:**

```bash
git pull origin main
docker compose up -d --build
```

---

## Versioning

ระบบใช้ version จาก `package.json` ทั้งฝั่ง frontend และ backend:

- **Footer** แสดง `คณะวิทยาการสารสนเทศ มหาวิทยาลัยบูรพา · v1.2.1`
- **`GET /health`** return `{ status, version, timestamp }`

เมื่อ release version ใหม่:

1. Bump version (เลือก patch / minor / major):

```bash
cd backend && npm version minor
cd ../frontend && npm version minor --no-git-tag-version
git add frontend/package.json && git commit -m "chore: sync frontend version to x.x.x"
```

2. Push พร้อม tags:

```bash
git push origin main --tags
```

3. Rebuild และ deploy:

```bash
docker compose up -d --build
```

---

## แก้ปัญหาเบื้องต้น

| อาการ                        | วิธีตรวจสอบ                                                                |
| ---------------------------- | -------------------------------------------------------------------------- |
| หน้าเว็บขึ้นแต่ API ไม่ทำงาน | `docker compose logs backend` — ดู error                                   |
| AI ตรวจงานไม่ได้             | ตรวจสอบ `OLLAMA_URL` ใน `.env` และ Ollama รันอยู่หรือเปล่า                 |
| Port 80 ถูกใช้งานแล้ว        | แก้ `docker-compose.yml` บรรทัด `ports: - "8080:80"` แล้วเข้าที่ port 8080 |
| Container crash ตลอด         | `docker compose logs backend --tail 50` เพื่อดู error                      |
| Database error               | ตรวจสอบ volume: `docker volume ls`                                         |
