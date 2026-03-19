import * as fs from 'fs';
import * as path from 'path';
import { messagingApi } from '@line/bot-sdk';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const IMAGE_PATH =
  'C:/Users/patip/Desktop/practical project/rich pig/messageImage_1773947862374.jpg';

async function main() {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN!;

  const client = new messagingApi.MessagingApiClient({ channelAccessToken });
  const blobClient = new messagingApi.MessagingApiBlobClient({
    channelAccessToken,
  });

  // 1. สร้าง Rich Menu โดยกำหนด area และ action แต่ละปุ่ม
  console.log('1. Creating rich menu...');
  const { richMenuId } = await client.createRichMenu({
    size: { width: 1408, height: 768 },
    selected: true,
    name: 'PaPaiKin Main Menu',
    chatBarText: 'เมนู',
    areas: [
      {
        // ปุ่มซ้าย: สุ่มเมนู
        bounds: { x: 0, y: 0, width: 704, height: 768 },
        action: { type: 'message', text: 'สุ่มเมนู' },
      },
      {
        // ปุ่มขวา: ส่งรูปอาหาร → เปิดกล้องทันที
        bounds: { x: 704, y: 0, width: 704, height: 768 },
        action: { type: 'camera' },
      },
    ],
  });
  console.log('Rich menu created:', richMenuId);

  // 2. Upload รูป Rich Menu
  console.log('2. Uploading image...');
  const imageBuffer = fs.readFileSync(IMAGE_PATH);
  const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
  await blobClient.setRichMenuImage(richMenuId, blob);
  console.log('Image uploaded');

  // 3. Set เป็น default สำหรับทุก user
  console.log('3. Setting as default rich menu...');
  await client.setDefaultRichMenu(richMenuId);
  console.log('Done! Rich menu ID:', richMenuId);
}

main().catch(console.error);
