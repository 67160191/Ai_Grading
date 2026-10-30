# 🐧 คู่มือการติดตั้งและเปิดเซิร์ฟเวอร์บน Linux (Linux Deployment Guide)

เอกสารนี้จัดทำขึ้นสำหรับนำระบบ **AI Exam & Grading System** ไปรันบนเครื่อง Linux Server เพื่อเปิดให้นิสิตเข้าทำข้อสอบพร้อมกัน **106 คน** โดยระบบได้บรรจุฐานข้อมูล (`app.db`), ค่าคอนฟิก (`.env`), บัญชีผู้ใช้ของนิสิตทั้ง 106 คน และบัญชีอาจารย์/แอดมินไว้เรียบร้อยแล้วในชุดโค้ดนี้

---

## 📌 สรุปข้อมูลสำคัญก่อนเริ่มใช้งาน

| รายการ | รายละเอียด |
| :--- | :--- |
| **Port ให้บริการ** | `8800` (เช่น `http://192.168.1.50:8800` หรือตาม IP ของเครื่อง Linux) |
| **ฐานข้อมูล** | SQLite (เปิดโหมด WAL) อยู่ที่ `./backend/data/app.db` |
| **โฟลเดอร์ไฟล์อัปโหลด** | `./backend/src/uploads/` |
| **บัญชี Admin** | Username: `admin` \| Password: `Admin@Exam2026!` |
| **บัญชีอาจารย์** | Username: `kubola` (อ.คนึงนิจ) \| Password: `1234` |
| **บัญชีนิสิต (106 คน)** | Username: `69160001` ถึง `69160106`<br>Password: ใช้รหัสนิสิตตัวเอง (เช่น `69160001`) |
| **วิชาที่ลงทะเบียนไว้** | วิชา ID 4 ("Test") นิสิตทั้ง 106 คนลงทะเบียนไว้แล้ว |

---

## 🛠️ 1. สิ่งที่ต้องมีบนเครื่อง Linux (Prerequisites)

เครื่อง Linux (Ubuntu 20.04 / 22.04 / 24.04 LTS, Debian หรือ RHEL/CentOS) ต้องติดตั้ง:
1. **Git**
2. **Docker Engine** และ **Docker Compose**

### คำสั่งติดตั้งสำหรับ Ubuntu / Debian (หากยังไม่มี):
```bash
sudo apt update
sudo apt install -y git docker.io docker-compose-v2
sudo systemctl enable --now docker

# ให้สิทธิ์ user ปัจจุบันรัน docker ได้โดยไม่ต้องพิมพ์ sudo (ถ้าต้องการ)
sudo usermod -aG docker $USER
newgrp docker
```

---

## 🚀 2. ขั้นตอนการนำระบบขึ้นรัน (Deployment Steps)

### ขั้นตอนที่ 1: Clone โค้ดลงเครื่อง Linux
```bash
git clone https://github.com/67160191/Ai_Grading.git
cd Ai_Grading
```

### ขั้นตอนที่ 2: รันผ่าน Script อัตโนมัติ (แนะนำ)
ทางเราได้เตรียมไฟล์ `deploy_linux.sh` ที่จะตรวจสอบความพร้อม, ตั้งค่า Permission ป้องกันปัญหา SQLite Lock, และสั่งเปิด Docker ให้โดยอัตโนมัติ:

```bash
chmod +x deploy_linux.sh
./deploy_linux.sh
```

---

### 💡 (ทางเลือก) ขั้นตอนการรันด้วยตัวเองแบบ Manual
หากต้องการรันคำสั่งด้วยตนเองทีละขั้นตอน ให้ทำดังนี้:

```bash
# 1. กำหนดสิทธิ์ให้ Docker สามารถเขียนไฟล์ฐานข้อมูลได้ (สำคัญมากบน Linux)
mkdir -p backend/data backend/src/uploads
chmod -R 777 backend/data backend/src/uploads

# 2. ตรวจสอบไฟล์ฐานข้อมูล
ls -lh backend/data/app.db

# 3. สั่ง Build และรัน Docker Container
docker compose up -d --build
```

---

## 🛡️ 3. การเปิด Firewall (เปิด Port 8800)

เพื่อให้เครื่องของนิสิตในห้องสอบสามารถเชื่อมต่อเข้ามาที่ Port 8800 ได้ ให้เปิดพอร์ตใน Firewall:

### กรณีใช้ UFW (Ubuntu / Debian):
```bash
sudo ufw allow 8800/tcp
sudo ufw reload
```

### กรณีใช้ Firewalld (CentOS / Rocky / AlmaLinux):
```bash
sudo firewall-cmd --permanent --add-port=8800/tcp
sudo firewall-cmd --reload
```

---

## 🔍 4. การตรวจสอบ IP Address เพื่อให้นิสิตเข้าใช้งาน

ตรวจสอบ IP ของเครื่องเซิร์ฟเวอร์โดยรัน:
```bash
hostname -I
```
หรือ
```bash
ip -4 addr show | grep inet
```
*ตัวอย่าง:* หาก IP ของเครื่อง Linux คือ `192.168.1.150`  
ให้นิสิตทุกคนเปิดเว็บเบราว์เซอร์ไปที่:
👉 **`http://192.168.1.150:8800`**

---

## 📋 5. ข้อมูลการเข้าสู่ระบบ (Accounts)

### 1) ผู้ดูแลระบบ (System Admin)
- **URL**: `http://<SERVER_IP>:8800`
- **Username**: `admin`
- **Password**: `Admin@Exam2026!`
- **ความสามารถ**: จัดการรายชื่อผู้ใช้, จัดการและรีเซ็ตรหัสผ่าน, ตรวจสอบ Activity Logs, ดาวน์โหลด Backup Database

### 2) อาจารย์ผู้สอน (Teacher)
- **Username**: `kubola`
- **Password**: `1234`
- **อาจารย์**: อ.คนึงนิจ
- **ความสามารถ**: จัดการข้อสอบ, ตรวจคะแนน, ดูผลสอบ และดาวน์โหลด CSV คะแนน

### 3) นิสิตสอบ (106 คน)
- **Usernames**: `69160001` ถึง `69160106`
- **Passwords**: รหัสนิสิตเดียวกัน (เช่น username `69160001` รหัสผ่าน `69160001`)
- **สถานะ**: ทุกคนลงทะเบียนอยู่ในคอร์สแล้ว ไม่ต้องกด Join Code ใหม่

---

## ⚙️ 6. คำสั่งดูแลระบบที่จำเป็น (Operations & Maintenance)

### ตรวจสอบสถานะการทำงาน:
```bash
docker compose ps
```

### ดู Log การทำงานแบบ Realtime:
```bash
docker compose logs -f
```

### สำรองข้อมูลฐานข้อมูล (Backup Database):
หากต้องการสำรองข้อมูลผลสอบของนิสิตระหว่างสอบหรือหลังสอบ:
```bash
cp backend/data/app.db ~/exam_backup_$(date +%Y%m%d_%H%M%S).db
```
*(หรือกดปุ่ม Download DB Backup จากเมนู Admin ได้ทันที)*

### การหยุดเซิร์ฟเวอร์:
```bash
docker compose down
```

### การเริ่มระบบใหม่ (Restart):
```bash
docker compose restart
```

---

## ❓ คำถามที่พบบ่อยและการแก้ปัญหา (Troubleshooting)

1. **นิสิตเข้าเว็บไม่ได้ (Connection Refused หรือ Timeout):**
   - ตรวจสอบว่าเครื่องนิสิตและเซิร์ฟเวอร์อยู่ในวงแลน (LAN/Wi-Fi) เดียวกันหรือไม่
   - ตรวจสอบว่าเปิด Firewall port 8800 แล้วหรือยัง (`sudo ufw allow 8800/tcp`)
   - ตรวจสอบว่า Container รันอยู่ด้วยคำสั่ง `docker compose ps`

2. **ฐานข้อมูลขึ้นข้อความ error "database is locked" หรือบันทึกคะแนนไม่ได้:**
   - เกิดจาก Permission ของระบบไฟล์ Linux ให้รันคำสั่ง:
     ```bash
     chmod -R 777 backend/data backend/src/uploads
     ```

3. **ต้องการเปลี่ยน Port จาก 8800 เป็น Port อื่น:**
   - แก้ไขไฟล์ `docker-compose.yml` ในส่วน `frontend` บรรทัด `ports:` เช่น เปลี่ยน `"8800:80"` เป็น `"80:80"` แล้วสั่ง `docker compose up -d`
