# PaPaiKin

LINE Bot สำหรับ Personal Nutrition Intelligence — ถ่ายรูปอาหาร → AI วิเคราะห์สารอาหาร → ติดตาม TDEE แบบ personalized + AI Agent แนะนำมื้ออาหารตามสารอาหารที่ขาด

---

## Features

| Feature | Description |
|---|---|
| Onboarding TDEE | 7-step survey (goal / gender / age / weight / height / activity / body fat) → คำนวณ TDEE + macro goals อัตโนมัติ |
| AI Calorie Counter | ส่งรูปอาหาร → Gemini วิเคราะห์แคลอรี่ + โปรตีน + คาร์บ + ไขมัน → auto-save |
| Nutrition Gap | เทียบ diary วันนี้ vs เป้าหมาย TDEE → รู้ว่าขาดสารอาหารอะไร |
| AI Agent | Gemini Function Calling + Google Places — แนะนำมื้อและร้านอาหารแบบ personalized ตาม gap |
| Conversation Memory | Agent จำบทสนทนาย้อนหลัง 6 turns — ถามต่อเนื่องได้โดยไม่ต้องอธิบายซ้ำ |
| LIFF Dashboard | Dashboard macro progress + ประวัติการกิน + แก้ไขโปรไฟล์ (goal / น้ำหนัก / กิจกรรม) |

---

## Tech Stack

```
Backend    NestJS + MongoDB (Mongoose) + LINE Bot SDK v10
AI         Google Gemini API (gemini-2.5-flash) + Function Calling
Maps       Google Places API (Nearby Search)
Frontend   React + Vite + TypeScript + LIFF SDK + Recharts + Axios
Tunnel     instatunnel.my
Deploy     LIFF → Vercel
```

---

## Project Structure

```
PaPaiKin/
├── backend/
│   └── src/
│       ├── line-bot/        # Webhook handler + onboarding state machine + AI Agent routing
│       ├── food-diary/      # Save and retrieve food intake history
│       ├── user-profile/    # TDEE calculation + user profile CRUD
│       ├── nutrition/       # Nutrition gap + weekly summary
│       ├── ai-agent/        # Gemini Function Calling agent
│       ├── google-places/   # Nearby restaurant search
│       └── gemini/          # AI food image analysis
└── liff-react/
    └── src/
        ├── App.tsx          # LIFF app (3-tab bottom nav)
        └── pages/
            ├── Dashboard.tsx    # Macro ring charts + today's meals
            ├── History.tsx      # Full food history table
            └── ProfileEditor.tsx # Edit goal / weight / activity / body fat
```

---

## Conversation Flow

```
Add Friend → Onboarding (7 steps) → TDEE calculated

[ส่งรูปอาหาร]
  → Gemini analyzes → saved to diary → Flex reply (nutrition + running total)
  → Quick reply: เช้า / กลางวัน / เย็น / มื้อดึก

[ข้อความอิสระ / แนะนำ / ขาดอะไร / หาร้าน]
  → AI Agent (Function Calling)
    tools: getDiaryToday, getUserGoals, getNutritionGap,
           getWeeklySummary, getNearbyRestaurants, getMenuRecommendation
  → ตอบ text + Flex Carousel (ร้านอาหาร) ตามต้องการ
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/line-bot/webhook` | Receive events from LINE |
| GET | `/history/data?userId=` | Get all food entries for a user |
| GET | `/user-profile?userId=` | Get user profile + TDEE goals |
| PUT | `/user-profile?userId=` | Update profile → recalculate TDEE |

---

## Database Collections

| Collection | Data |
|---|---|
| `fooddiaries` | User food intake log (lineUserId, menuName, calories, protein, carb, fat, mealType, cuisineType) |
| `userprofiles` | User profile (lineUserId, goal, gender, age, weight, height, activityLevel, bodyFatRange, dailyCalorie/Protein/Carb/FatGoal) |

---

## Environment Variables

Create `backend/.env`:

```env
DB_URI=mongodb://user:pass@localhost:27017/papaikin_db?authSource=admin

LINE_CHANNEL_SECRET=...
LINE_CHANNEL_ACCESS_TOKEN=...

GEMINI_API_KEY=...
GOOGLE_PLACES_API_KEY=...
```

---

## Getting Started

### 1. Backend

```bash
cd backend
npm install
npm run start:dev
```

### 2. Tunnel

```bash
instatunnel --port 3000
```

Update Webhook URL in LINE Developers Console → `https://<tunnel-url>/line-bot/webhook`

### 3. LIFF Frontend

```bash
cd liff-react
npm install
npm run dev
```

Deploy to Vercel → set Endpoint URL in LINE LIFF settings.

### 4. MongoDB (Docker)

```bash
docker compose up -d
```

---

## LIFF App

- **LIFF ID**: `2009619573-KoQIjGuU`
- **URL**: `https://liff.line.me/2009619573-KoQIjGuU`
- **Deploy**: Vercel (`pa-pai-kin.vercel.app`)

เปิดได้ภายใน LINE เท่านั้น
