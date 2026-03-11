# PaPaiKin

## Logs & Todos

### 23/2/2569

- create branch (connect-db)

### 24/2/2569

- config docker compose
- can connect mongo with mongoDB compass
- can create schema & connect mongo db

### 25/2/2569

- make prototype control-menu page
- edit schema => add field "category : string" in menus and shopMenuItems collection for mapping with UI control-menu(front) correctly
- [x] build UI control menu page
- [x] fix schema in backend for according Schema Diagram changed
- [x] in coltrol menu page can send API data => category:string , ingredients: string[], cooking: string[] correctly

### 28/2/2569

- completed control-menu feature
- changes DFD LV0 diagram 1.0 process call D2 Store instead D1 Store
- [x] change calling collection from D1 store(menu collections) to D2 store(shopMenuItem colleciton) instead.

### 1/3/2569

- fix file stucture in frontend (move /components out of /app to src/components)
- [x] fix file stucture in frontend (move /components out of /app to src/components)

### 2/3/2569

- [x] สร้างโครง navation and layout ของ Papaikin ผ่าน useRouter (FE)
- adjust dfd lv0 เดิม(P1.0 ไปขอ request แล้วส่งมาที่ P1.0) => ใหม่(P1.0 รับแค่คำตอบแล้วส่งข้อมูลคำตอบใน query param ไปยัง P2.0)

### 3/3/2569

- [x] push data from control-menu into guided menu page (FE)
- [x] can pull user current location

### 4/3/2569

- [x] permission location from user
- [x] send data from guided menu page to backend
- [x] frontend can pull data from backend

### 9/3/2569
- [x] improve guided menu feature

### 10/3/2569
- ปรับโปรเจกต์ใหม่ทั้งหมด ย้าย Frontend มาที่ Line แทน
- ค้าง Expo ที่ restaurant-listing branch
- สร้าง branch สำหรับทำ Line BOT ชื่อ line-bot

### 11/3/2569
- connected line webhook and messaging api

---

## Todo Lists

- [] build UI guided menu page (FE)

## Notes

### To connect mongodb in docker :

- open docker desktop
- run start container with `docker compose up -d`
- check all of container not loop restart

### To use mongosh shell // เน้นรัน mongosh ผ่าน docker ก่อนค่อยไปลอง install mongsh บน local ทีหลัง (หรือ on cloud ดีนะ)

- connected mongodb in docker
- run `docker exec -it papaikin-db bash`
- authentication with `mongosh -u <username> -p <password>`
- check authend with `show collections`

### To connect mongoDB compass

- use URI : `mongodb://myDatabaseUser:D1fficultP%40ssw0rd@mongodb0.example.com:27017/?authSource=admin`

### To run front-end with expo :

- use command `npx expo start`

### To run back-end with nestjs :

- use command `npm run start:dev`
