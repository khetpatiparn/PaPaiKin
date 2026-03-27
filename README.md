# PaPaiKin

A LINE Bot that recommends nearby food menus and restaurants, with a calorie tracking system powered by AI image analysis.

---

## Features

| Feature | Description |
|---|---|
| Random Menu | Answer 3 questions → get 3 recommendations (cheapest / nearest / random) |
| Quick Random | Instantly get 3 random restaurants near you |
| Random Restaurant | Choose style + max distance → get 3 restaurant options |
| Calorie Counter | Send a food photo → Gemini AI analyzes nutrition → auto-saved |
| Meal Summary | View today's calorie summary + open LIFF to see full history |

---

## Tech Stack

```
Backend    NestJS + MongoDB (Mongoose) + LINE Bot SDK + Google Gemini API
Frontend   React + Vite + TypeScript + LIFF SDK + Axios
Tunnel     instatunnel.my (expose local server to internet)
Deploy     LIFF → Vercel
```

---

## Project Structure

```
PaPaiKin/
├── backend/
│   └── src/
│       ├── line-bot/        # Webhook handler + bot state machine
│       ├── food-diary/      # Save and retrieve food intake history
│       ├── menu/            # Food menu data
│       ├── shop/            # Restaurant data
│       ├── shop-menu-item/  # Links shops + menus + geolocation
│       └── gemini/          # AI food image analysis
└── liff-react/
    └── src/
        └── App.tsx          # Food history page (LIFF web app)
```

---

## Conversation Flow

```
Rich Menu
├── Random Menu       → Q1 (category) → Q2 (protein) → Q3 (cooking style) → Location → 3 options
├── Quick Random      → Location → 3 random restaurants
├── Random Restaurant → Q1 (style) → Q2 (max distance) → Location → 3 restaurants
├── Calorie Counter   → Receive image → Gemini analysis → Save to FoodDiary → Reply with nutrition
└── Meal Summary      → Today's calorie summary + LIFF button
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/line-bot/webhook` | Receive events from LINE |
| GET | `/history/data?userId=` | Get all food entries for a user |
| POST | `/menu` | Create a menu |
| GET | `/menu` | List all menus |
| POST | `/menu/control-menu` | Filter menus by Q1/Q2/Q3 answers |
| POST | `/shop-menu-item` | Create a shop menu item |
| POST | `/shop-menu-item/guided-menu` | Get 3 recommendations by filter + location |
| GET | `/shop-menu-item/restaurant-listing/:menuId` | Find all restaurants serving a menu |

---

## Database Collections

| Collection | Data |
|---|---|
| `menus` | Food menus (name, category, ingredients, cooking method) |
| `shops` | Restaurants (name, image, GeoJSON location) |
| `shopmenuitems` | Menu items per shop with location + price (used for nearest/cheapest/random) |
| `fooddiaries` | User food intake log (lineUserId, menu name, calories, protein, carb, fat) |

---

## Getting Started

### 1. Backend

```bash
cd backend
npm install
```

Create `backend/.env`:

```env
DB_URI=mongodb://user:pass@localhost:27017/papaikin_db?authSource=admin

LINE_CHANNEL_SECRET=...
LINE_CHANNEL_ACCESS_TOKEN=...

GEMINI_API_KEY=...

SERVER_URL=https://liff.line.me/<LIFF_ID>
```

Run:

```bash
npm run start:dev
```

### 2. Tunnel

```bash
instatunnel --port 3000
```

Update the Webhook URL in LINE Developers Console to `https://<tunnel-url>/line-bot/webhook`

### 3. LIFF Frontend

```bash
cd liff-react
npm install
npm run dev
```

Deploy to Vercel and set the Endpoint URL in LINE LIFF settings.

### 4. Rich Menu Setup

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

Can only be opened inside the LINE app.
