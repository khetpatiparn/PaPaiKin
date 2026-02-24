# PaPaiKin

Logs
23/2/2569
- create branch (connect-db)
24/2/2569
- config docker compose
- can connect mongo with mongoDB compass
- can create schema & connect mongo db

Notes:
To connect mongodb in docker :
- open docker desktop
- run start container with "docker compose up -d"
- check all of container not loop restart

To use mongosh shell // เน้นรัน mongosh ผ่าน docker ก่อนค่อยไปลอง install mongsh บน local ทีหลัง (หรือ on cloud ดีนะ)
- connected mongodb in docker
- run "docker exec -it papaikin-db bash"
- authentication with "mongosh -u <username> -p <password>"
- check authend with "show collections"

To connect mongoDB compass 
- use URI : "mongodb://myDatabaseUser:D1fficultP%40ssw0rd@mongodb0.example.com:27017/?authSource=admin"