# PaPaiKin (ปะไปกิน)

LINE Bot ช่วยแนะนำเมนูอาหารและร้านอาหารใกล้เคียง พร้อมระบบติดตามแคลอรี่จากรูปภาพอาหาร

---

## Features

| Feature | รายละเอียด |
|---|---|
| สุ่มเมนู | ตอบคำถาม 3 ข้อ → แนะนำเมนู (ถูก / ใกล้ / สุ่ม) |
| สุ่มด่วน | สุ่ม 3 ร้านทันที ไม่มีคำถาม |
| สุ่มร้าน | เลือกสไตล์ + ระยะทางสูงสุด → แนะนำร้าน |
| นับแคล | ส่งรูปอาหาร → Gemini วิเคราะห์โภชนาการ → บันทึกอัตโนมัติ |
| สรุปมื้อ | ดูสรุปแคลอรี่วันนี้ + ปุ่มเปิด LIFF ดูประวัติย้อนหลัง |

---

## Tech Stack

```
Backend   NestJS + MongoDB (Mongoose) + LINE Bot SDK + Google Gemini API
Frontend  React + Vite + TypeScript + LIFF SDK + Axios
Tunnel    instatunnel.my (expose local server to internet)
Deploy    LIFF → Vercel
```

---

## Project Structure

```
PaPaiKin/
├── backend/
│   └── src/
│       ├── line-bot/        # Webhook + state machine หลักของ bot
│       ├── food-diary/      # บันทึกและดึงประวัติการกิน
│       ├── menu/            # ข้อมูลเมนูอาหาร
│       ├── shop/            # ข้อมูลร้านอาหาร
│       ├── shop-menu-item/  # เชื่อมร้าน + เมนู + พิกัด
│       └── gemini/          # วิเคราะห์รูปอาหารด้วย AI
└── liff-react/
    └── src/
        └── App.tsx          # หน้าแสดงประวัติการกินทั้งหมด
```

---

## Conversation Flow

```
Rich Menu
├── สุ่มเมนู  → Q1 (ประเภท) → Q2 (โปรตีน) → Q3 (วิธีทำ) → ขอ Location → แสดง 3 ตัวเลือก
├── สุ่มด่วน  → ขอ Location → แสดง 3 ร้านสุ่ม
├── สุ่มร้าน  → Q1 (สไตล์ร้าน) → Q2 (ระยะทางสูงสุด) → ขอ Location → แสดง 3 ร้าน
├── นับแคล   → รับรูปภาพ → Gemini วิเคราะห์ → บันทึก FoodDiary → ส่งผลโภชนาการ
└── สรุปมื้อ  → สรุปแคลอรี่วันนี้ + ปุ่มเปิด LIFF
```

---

## API Endpoints

| Method | Path | หน้าที่ |
|---|---|---|
| POST | `/line-bot/webhook` | รับ event จาก LINE |
| GET | `/history/data?userId=` | ดึงประวัติการกินทั้งหมดของ user |
| POST | `/menu` | เพิ่มเมนู |
| GET | `/menu` | ดูเมนูทั้งหมด |
| POST | `/menu/control-menu` | กรองเมนูด้วย Q1/Q2/Q3 |
| POST | `/shop-menu-item` | เพิ่มเมนูของร้าน |
| POST | `/shop-menu-item/guided-menu` | แนะนำ 3 ตัวเลือกตาม filter + location |
| GET | `/shop-menu-item/restaurant-listing/:menuId` | หาร้านที่มีเมนูนั้น |

---

## Database Collections

| Collection | ข้อมูล |
|---|---|
| `menus` | เมนูอาหาร (ชื่อ, หมวดหมู่, วัตถุดิบ, วิธีทำ) |
| `shops` | ร้านอาหาร (ชื่อ, รูป, พิกัด GeoJSON) |
| `shopmenuitems` | เมนูประจำร้าน + พิกัด + ราคา (ใช้คำนวณ ใกล้/ถูก/สุ่ม) |
| `fooddiaries` | บันทึกการกินของ user (lineUserId, เมนู, แคล, โปรตีน, คาร์บ, ไขมัน) |

---

## Getting Started

### 1. ติดตั้ง Backend

```bash
cd backend
npm install
```

สร้างไฟล์ `backend/.env`:

```env
DB_URI=mongodb://user:pass@localhost:27017/papaikin_db?authSource=admin

LINE_CHANNEL_SECRET=...
LINE_CHANNEL_ACCESS_TOKEN=...

GEMINI_API_KEY=...

SERVER_URL=https://liff.line.me/<LIFF_ID>
```

รัน:

```bash
npm run start:dev
```

### 2. เปิด Tunnel

```bash
instatunnel --port 3000
```

อัพเดท Webhook URL ใน LINE Developers Console → `https://<tunnel-url>/line-bot/webhook`

### 3. ติดตั้ง LIFF Frontend

```bash
cd liff-react
npm install
npm run dev
```

Deploy บน Vercel แล้วตั้ง Endpoint URL ใน LINE LIFF settings

### 4. Setup Rich Menu

```bash
cd backend
npx ts-node -r tsconfig-paths/register scripts/setup-rich-menu.ts
```

### 5. MongoDB (Docker)

```bash
docker compose up -d
```

---

## LIFF App

- **LIFF ID**: `2009619573-KoQIjGuU`
- **URL**: `https://liff.line.me/2009619573-KoQIjGuU`
- **Deploy**: Vercel (`pa-pai-kin.vercel.app`)

เปิดได้เฉพาะในแอป LINE เท่านั้น
