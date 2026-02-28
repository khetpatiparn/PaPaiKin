# PaPaiKin

## Logs

### 23/2/2569
- create branch (connect-db)

### 24/2/2569
- config docker compose
- can connect mongo with mongoDB compass
- can create schema & connect mongo db

### 25/2/2569
- make prototype control-menu page
- edit schema => add field "category : string" in menus and shopMenuItems collection for mapping with UI control-menu(front) correctly 

---

## Todos

### control-menu features:
- [ ] build UI control menu page
- [ ] in coltrol menu page can send API data => category:string , ingredients: string[], cooking: string[] correctly
- [ ] fix schema in backend for according Schema Diagram changed

---

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