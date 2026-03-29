import * as fs from 'fs';
import * as path from 'path';
import { messagingApi } from '@line/bot-sdk';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const IMAGE_PATH =
  // 'C:/Users/patip/Desktop/practical project/rich pig/messageImage_1773947862374.jpg';
  'C:/Users/patip/Desktop/practical project/rich pig/สุ่มเมนู.jpg';
// 'C:/Users/patip/Desktop/practical project/rich pig/สุ่มเมนู (5).jpg';

async function main() {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN!;

  const client = new messagingApi.MessagingApiClient({ channelAccessToken });
  const blobClient = new messagingApi.MessagingApiBlobClient({
    channelAccessToken,
  });

  // 1. สร้าง Rich Menu โดยกำหนด area และ action แต่ละปุ่ม
  console.log('1. Creating rich menu...');
  const { richMenuId } = await client.createRichMenu(
    //   {
    //   size: {
    //     width: 2500,
    //     height: 1686,
    //   },
    //   selected: true,
    //   name: 'Rich Menu 1',
    //   chatBarText: 'เมนู',
    //   areas: [
    //     {
    //       bounds: {
    //         x: 198,
    //         y: 93,
    //         width: 646,
    //         height: 764,
    //       },
    //       action: {
    //         type: 'message',
    //         text: 'สุ่มร้าน',
    //       },
    //     },
    //     {
    //       bounds: {
    //         x: 207,
    //         y: 1014,
    //         width: 658,
    //         height: 514,
    //       },
    //       action: { type: 'camera' },
    //     },
    //     {
    //       bounds: {
    //         x: 895,
    //         y: 541,
    //         width: 701,
    //         height: 789,
    //       },
    //       action: {
    //         type: 'message',
    //         text: 'สุ่มเมนู',
    //       },
    //     },
    //     {
    //       bounds: {
    //         x: 1634,
    //         y: 55,
    //         width: 701,
    //         height: 667,
    //       },
    //       action: {
    //         type: 'message',
    //         text: 'สุ่มด่วน',
    //       },
    //     },
    //     {
    //       bounds: {
    //         x: 1667,
    //         y: 815,
    //         width: 743,
    //         height: 696,
    //       },
    //       action: {
    //         type: 'message',
    //         text: 'สรุปมื้อ',
    //       },
    //     },
    //   ],
    // }
    {
      size: {
        width: 2500,
        height: 1686,
      },
      selected: true,
      name: 'Rich Menu 1',
      chatBarText: 'เมนู',
      areas: [
        {
          bounds: {
            x: 59,
            y: 59,
            width: 1144,
            height: 777,
          },
          action: { type: 'camera' },
        },
        {
          bounds: {
            x: 1279,
            y: 51,
            width: 1161,
            height: 785,
          },
          action: {
            type: 'message',
            text: 'สวัสดี',
          },
        },
        {
          bounds: {
            x: 63,
            y: 878,
            width: 1149,
            height: 773,
          },
          action: {
            type: 'uri',
            uri: 'https://liff.line.me/2009619573-KoQIjGuU',
          },
        },
        {
          bounds: {
            x: 1275,
            y: 870,
            width: 1178,
            height: 789,
          },
          action: {
            type: 'message',
            text: 'สรุปมื้อ',
          },
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
