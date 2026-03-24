import * as fs from 'fs';
import * as path from 'path';
import { messagingApi } from '@line/bot-sdk';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const IMAGE_PATH =
  // 'C:/Users/patip/Desktop/practical project/rich pig/messageImage_1773947862374.jpg';
  'C:/Users/patip/Desktop/practical project/rich pig/สุ่มเมนู.jpg';

async function main() {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN!;

  const client = new messagingApi.MessagingApiClient({ channelAccessToken });
  const blobClient = new messagingApi.MessagingApiBlobClient({
    channelAccessToken,
  });

  // 1. สร้าง Rich Menu โดยกำหนด area และ action แต่ละปุ่ม
  console.log('1. Creating rich menu...');
  const { richMenuId } = await client.createRichMenu(
    // {
    // size: { width: 1408, height: 768 },
    // selected: true,
    // name: 'PaPaiKin Main Menu',
    // chatBarText: 'เมนู',
    // areas: [
    //   {
    //     bounds: { x: 0, y: 0, width: 704, height: 768 },
    //     action: { type: 'message', text: 'สุ่มเมนู' },
    //   },
    //   {
    //     bounds: { x: 704, y: 0, width: 704, height: 768 },
    //     action: { type: 'camera' },
    //   },
    // ],
    // }
    {
      size: {
        width: 2500,
        height: 1686,
      },
      selected: true,
      name: 'PaPaiKin',
      chatBarText: 'เมนู',
      areas: [
        {
          bounds: {
            x: 386,
            y: 109,
            width: 1001,
            height: 1305,
          },
          action: {
            type: 'message',
            text: 'สุ่มเมนู',
          },
        },
        {
          bounds: {
            x: 1427,
            y: 110,
            width: 857,
            height: 1296,
          },
          action: { type: 'camera' },
        },
      ],
    },
  );
  console.log('Rich menu created:', richMenuId);

  console.log('2. Uploading image...');
  const imageBuffer = fs.readFileSync(IMAGE_PATH);
  const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
  await blobClient.setRichMenuImage(richMenuId, blob);
  console.log('Image uploaded');

  console.log('3. Setting as default rich menu...');
  await client.setDefaultRichMenu(richMenuId);
  console.log('Done! Rich menu ID:', richMenuId);
}

main().catch(console.error);
