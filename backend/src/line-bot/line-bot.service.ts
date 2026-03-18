import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { messagingApi, webhook } from '@line/bot-sdk';
import { ShopMenuItemService } from 'src/shop-menu-item/shop-menu-item.service';
import { ShopMenuItemDocument } from 'src/shop-menu-item/schema/shop-menu-item.schema';

interface UserSession {
  currentStep: 'IDLE' | 'Q1' | 'Q2' | 'Q3' | 'LOCATION';
  answers: {
    q1?: string;
    q2?: string;
    q3?: string;
  };
}

@Injectable()
export class LineBotService {
  private readonly client: messagingApi.MessagingApiClient;
  private sessions = new Map<string, UserSession>();

  private readonly Q1_OPTIONS = ['SINGLE_DISH', 'NOODLE', 'SIDE_DISH'];

  constructor(
    private readonly configService: ConfigService,
    private readonly shopMenuItemService: ShopMenuItemService,
  ) {
    this.client = new messagingApi.MessagingApiClient({
      channelAccessToken: this.configService.get<string>(
        'LINE_CHANNEL_ACCESS_TOKEN',
      )!,
    });
  }

  private async replyText(replyToken: string, text: string): Promise<void> {
    await this.client.replyMessage({
      replyToken: replyToken,
      messages: [{ type: 'text', text }],
    });
  }

  async handleEvent(event: webhook.Event): Promise<void> {
    const userId = event.source?.type === 'user' ? event.source.userId : null;
    if (!userId) {
      return;
    }

    let session = this.sessions.get(userId);
    if (!session) {
      session = {
        currentStep: 'IDLE',
        answers: {},
      };
      this.sessions.set(userId, session);
    }

    if (event.type === 'message') {
      const messageEvent = event;

      if (messageEvent.message.type === 'text') {
        const text = messageEvent.message.text;

        if (text === 'สุ่มเมนู') {
          session.currentStep = 'Q1';
          session.answers = {};
          return this.askQ1(messageEvent.replyToken!);
        }
      } else if (messageEvent.message.type === 'location') {
        if (session.currentStep !== 'LOCATION') {
          await this.replyText(
            messageEvent.replyToken!,
            `พิมพ์ 'สุ่มเมนู' เพื่อใช้งาน`,
          );
          return;
        }

        const answers = { ...session.answers };
        const { latitude, longitude } = messageEvent.message;

        session.currentStep = 'IDLE';
        session.answers = {};

        await this.replyText(messageEvent.replyToken!, `กำลังค้นหาเมนู.....`);

        const result = await this.shopMenuItemService.getGuidedMenu({
          userAnswer: {
            q1: answers.q1!,
            q2: answers.q2!,
            q3: answers.q3!,
          },
          userLocation: {
            latitude,
            longitude,
          },
        });
        const { randomMenu, cheapestMenu, nearestMenu, distanceCards } = result;

        const bubbles: any[] = [];

        if (randomMenu && distanceCards[0] !== null) {
          const km = (distanceCards[0] / 1000).toFixed(2);
          bubbles.push(
            this.buildMenuBubble('เมนูแนะนำ', '#C44A3A', randomMenu, km),
          );
        }
        if (randomMenu && distanceCards[1] !== null) {
          const km = (distanceCards[1] / 1000).toFixed(2);
          bubbles.push(
            this.buildMenuBubble('เมนูประหยัด', '#6FAF4F', cheapestMenu!, km),
          );
        }
        if (randomMenu && distanceCards[2] !== null) {
          const km = (distanceCards[2] / 1000).toFixed(2);
          bubbles.push(
            this.buildMenuBubble('เมนูใกล้ฉัน', '#4C8CE4', nearestMenu!, km),
          );
        }

        if (bubbles.length > 0) {
          await this.client.pushMessage({
            to: userId,
            messages: [
              {
                type: 'flex',
                altText: 'ผลการสุ่ม',
                contents: {
                  type: 'carousel',
                  contents: bubbles,
                },
              },
            ],
          });
        } else {
          await this.client.pushMessage({
            to: userId,
            messages: [
              {
                type: 'text',
                text: 'ไม่พบเมนู ลองสุ่มใหม่อีกครั้ง',
              },
            ],
          });
        }
      }
    } else if (event.type === 'postback') {
      const postbackEvent = event;
      return this.handlePostback(
        postbackEvent.replyToken!,
        userId,
        postbackEvent.postback.data,
      );
    }
  }

  private async askQ1(replyToken: string) {
    await this.client.replyMessage({
      replyToken,
      messages: [
        {
          type: 'flex',
          altText: 'อยากกินแบบไหนหรอ?',
          contents: {
            type: 'bubble',
            header: {
              type: 'box',
              layout: 'vertical',
              paddingAll: 'lg',
              contents: [
                {
                  type: 'text',
                  text: 'อยากกินแบบไหนหรอ?',
                  size: 'lg',
                  weight: 'bold',
                },
              ],
            },
            body: {
              type: 'box',
              layout: 'vertical',
              spacing: 'sm',
              contents: [
                {
                  type: 'button',
                  action: {
                    type: 'postback',
                    label: 'จานเดียว',
                    data: 'q1=SINGLE_DISH',
                    displayText: 'จานเดียว',
                  },
                  style: 'primary',
                  height: 'sm',
                },
                {
                  type: 'button',
                  action: {
                    type: 'postback',
                    label: 'เส้น',
                    data: 'q1=NOODLE',
                    displayText: 'เส้น',
                  },
                  style: 'primary',
                  height: 'sm',
                },
                {
                  type: 'button',
                  action: {
                    type: 'postback',
                    label: 'กับข้าว',
                    data: 'q1=SIDE_DISH',
                    displayText: 'กับข้าว',
                  },
                  style: 'primary',
                  height: 'sm',
                },
                {
                  type: 'button',
                  action: {
                    type: 'postback',
                    label: 'อะไรก็ได้',
                    data: 'q1=ANY',
                    displayText: 'อะไรก็ได้',
                  },
                  style: 'primary',
                  height: 'sm',
                  color: '#3f3f3f',
                },
                {
                  type: 'button',
                  action: {
                    type: 'postback',
                    label: 'บอกมาเลยดีกว่า',
                    data: 'q1=SKIP',
                    displayText: 'บอกมาเลยดีกว่า',
                  },
                  style: 'secondary',
                  height: 'sm',
                },
              ],
            },
          },
        },
      ],
    });
  }

  private async askQ2(replyToken: string) {
    await this.client.replyMessage({
      replyToken,
      messages: [
        {
          type: 'flex',
          altText: 'แล้วพวกเนื้อสัตว์หล่ะ',
          contents: {
            type: 'bubble',
            header: {
              type: 'box',
              layout: 'vertical',
              paddingAll: 'lg',
              contents: [
                {
                  type: 'text',
                  text: 'แล้วพวกเนื้อสัตว์หล่ะ',
                  size: 'lg',
                  weight: 'bold',
                },
              ],
            },
            body: {
              type: 'box',
              layout: 'vertical',
              spacing: 'sm',
              contents: [
                {
                  type: 'button',
                  action: {
                    type: 'postback',
                    label: 'หมู',
                    data: 'q2=PORK',
                    displayText: 'หมู',
                  },
                  style: 'primary',
                  height: 'sm',
                },
                {
                  type: 'button',
                  action: {
                    type: 'postback',
                    label: 'ไก่',
                    data: 'q2=CHICKEN',
                    displayText: 'ไก่',
                  },
                  style: 'primary',
                  height: 'sm',
                },
                {
                  type: 'button',
                  action: {
                    type: 'postback',
                    label: 'เนื้อ',
                    data: 'q2=BEEF',
                    displayText: 'เนื้อ',
                  },
                  style: 'primary',
                  height: 'sm',
                },
                {
                  type: 'button',
                  action: {
                    type: 'postback',
                    label: 'ทะเล',
                    data: 'q2=SEAFOOD',
                    displayText: 'ทะเล',
                  },
                  style: 'primary',
                  height: 'sm',
                },
                {
                  type: 'button',
                  action: {
                    type: 'postback',
                    label: 'มังสวิรัติ',
                    data: 'q2=VEGETARIAN',
                    displayText: 'มังสวิรัติ',
                  },
                  style: 'primary',
                  height: 'sm',
                },
                {
                  type: 'button',
                  action: {
                    type: 'postback',
                    label: 'อะไรก็ได้',
                    data: 'q2=ANY',
                    displayText: 'อะไรก็ได้',
                  },
                  style: 'primary',
                  height: 'sm',
                  color: '#3f3f3f',
                },
              ],
            },
          },
        },
      ],
    });
  }

  private async askQ3(replyToken: string) {
    await this.client.replyMessage({
      replyToken,
      messages: [
        {
          type: 'flex',
          altText: 'ให้เสิร์ฟแบบไหนดี',
          contents: {
            type: 'bubble',
            header: {
              type: 'box',
              layout: 'vertical',
              paddingAll: 'lg',
              contents: [
                {
                  type: 'text',
                  text: 'ให้เสิร์ฟแบบไหนดี',
                  size: 'lg',
                  weight: 'bold',
                },
              ],
            },
            body: {
              type: 'box',
              layout: 'vertical',
              spacing: 'sm',
              contents: [
                {
                  type: 'button',
                  action: {
                    type: 'postback',
                    label: 'แบบแห้ง (ผัด/ทอด/ย่าง/ยำ)',
                    data: 'q3=DRY',
                    displayText: 'แบบแห้ง (ผัด/ทอด/ย่าง/ยำ)',
                  },
                  style: 'primary',
                  height: 'sm',
                },
                {
                  type: 'button',
                  action: {
                    type: 'postback',
                    label: 'แบบน้ำ (แกง/ต้ม/ซุป)',
                    data: 'q3=SOUP',
                    displayText: 'แบบน้ำ (แกง/ต้ม/ซุป)',
                  },
                  style: 'primary',
                  height: 'sm',
                },
                {
                  type: 'button',
                  action: {
                    type: 'postback',
                    label: 'อะไรก็ได้',
                    data: 'q3=ANY',
                    displayText: 'อะไรก็ได้',
                  },
                  style: 'primary',
                  height: 'sm',
                  color: '#3f3f3f',
                },
              ],
            },
          },
        },
      ],
    });
  }

  private pickRandom(options: string[]): string {
    const index = Math.floor(Math.random() * options.length);
    return options[index];
  }

  private async askLocation(replyToken: string) {
    await this.client.replyMessage({
      replyToken,
      messages: [
        {
          type: 'text',
          text: 'ปุ่มข้างล่างนี่..ช่วยกดมันหน่อยสิ เพื่อส่งตำแหน่งมาให้เรา 👇',
          quickReply: {
            items: [
              {
                type: 'action',
                action: { type: 'location', label: 'ส่งตำแหน่ง' },
              },
            ],
          },
        },
      ],
    });
  }

  private async handlePostback(
    replyToken: string,
    userId: string,
    data: string,
  ) {
    const session = this.sessions.get(userId)!;
    const params = new URLSearchParams(data);

    if (params.has('q1') && session.currentStep !== 'Q1') return;
    if (params.has('q2') && session.currentStep !== 'Q2') return;
    if (params.has('q3') && session.currentStep !== 'Q3') return;

    if (params.has('q1')) {
      const q1Value = params.get('q1')!;

      if (q1Value === 'SKIP') {
        session.answers.q1 = this.pickRandom(this.Q1_OPTIONS);
        session.answers.q2 = undefined;
        session.answers.q3 = undefined;
        session.currentStep = 'LOCATION';
        await this.askLocation(replyToken);
        return;
      } else {
        session.answers.q1 =
          q1Value === 'ANY' ? this.pickRandom(this.Q1_OPTIONS) : q1Value;
        console.log(' Q1 value:', session.answers.q1);
        session.currentStep = 'Q2';
        await this.askQ2(replyToken);
      }
    } else if (params.has('q2')) {
      const q2Value = params.get('q2')!;
      session.answers.q2 = q2Value === 'ANY' ? undefined : q2Value;
      console.log(' Q2 value:', session.answers.q2);
      session.currentStep = 'Q3';
      await this.askQ3(replyToken);
    } else if (params.has('q3')) {
      const q3Value = params.get('q3')!;
      session.answers.q3 = q3Value === 'ANY' ? undefined : q3Value;
      console.log(' Q3 value:', session.answers.q3);
      session.currentStep = 'LOCATION';
      await this.askLocation(replyToken);
    }

    if (params.has('viewShops')) {
      const menuId = params.get('viewShops');
      if (!menuId) return;

      const restaurants = await this.shopMenuItemService.findRestaurantByMenu({
        menuId,
      });

      if (restaurants.length === 0) {
        await this.replyText(
          replyToken,
          ' เราขอโทษด้วยจริงๆ ไม่พบร้านที่ขายเมนูนี้ในระบบ',
        );
        return;
      }

      const bubbles: any[] = restaurants.map((restaurant) =>
        this.buildRestaurantBubble(restaurant),
      );

      if (bubbles.length > 0) {
        console.log('restaurant bubbles:', JSON.stringify(bubbles, null, 2));
        await this.client.replyMessage({
          replyToken,
          messages: [
            {
              type: 'flex',
              altText: 'ร้านที่ขายเมนูนี้',
              contents: {
                type: 'carousel',
                contents: bubbles,
              },
            },
          ],
        });
      }
    }
    return;
  }

  private getPriceLevel(price: number): string {
    if (price <= 40) return '฿ (ต่ำกว่า 40 บาท)';
    if (price <= 70) return '฿฿ (40 - 70 บาท)';
    if (price <= 120) return '฿฿฿ (70 - 120 บาท)';
    return '฿฿฿฿ (120 บาทขึ้นไป)';
  }

  private buildMenuBubble(
    tag: string,
    colorTag: string,
    menu: ShopMenuItemDocument,
    distanceKm: string,
  ) {
    return {
      type: 'bubble' as const,
      hero: {
        type: 'image',
        url: menu.menuImage,
        size: 'full',
        aspectRatio: '20:13',
        aspectMode: 'cover',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: tag,
                align: 'center',
                color: '#ffffff',
                size: 'sm',
                weight: 'bold',
              },
            ],
            backgroundColor: colorTag,
            paddingAll: '5px',
            paddingStart: '12px',
            paddingEnd: '12px',
            cornerRadius: '20px',
            width: '100px',
          },
          {
            type: 'text',
            text: menu.menuName,
            weight: 'bold',
            size: 'xl',
            margin: 'sm',
            wrap: true,
          },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'sm',
            spacing: 'xs',
            contents: [
              {
                type: 'box',
                layout: 'baseline',
                contents: [
                  {
                    type: 'text',
                    text: 'ช่วงราคา',
                    weight: 'bold',
                    flex: 3,
                    size: 'xs',
                    color: '#555555',
                  },
                  {
                    type: 'text',
                    text: this.getPriceLevel(menu.price),
                    flex: 5,
                    color: '#888888',
                    size: 'sm',
                  },
                ],
              },
              {
                type: 'box',
                layout: 'baseline',
                contents: [
                  {
                    type: 'text',
                    text: 'ใกล้คุณ',
                    weight: 'bold',
                    flex: 3,
                    size: 'xs',
                    color: '#555555',
                  },
                  {
                    type: 'text',
                    text: `${distanceKm} กม.`,
                    flex: 5,
                    color: '#888888',
                    size: 'sm',
                  },
                ],
              },
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            height: 'sm',
            action: {
              type: 'postback',
              label: '🍽️ ดูร้านที่มี',
              data: `viewShops=${menu.menuId.toString()}`,
              displayText: `ดูร้านที่ขาย "${menu.menuName}"`,
            },
          },
          {
            type: 'button',
            style: 'primary',
            height: 'sm',
            color: '#D97A2B',
            action: {
              type: 'postback',
              label: '📖 ดูสูตร',
              data: `viewRecipe=${menu.menuId.toString()}`,
              displayText: `ดูสูตร "${menu.menuName}"`,
            },
          },
        ],
      },
    };
  }

  private buildRestaurantBubble(item: ShopMenuItemDocument) {
    const lat = item.location.coordinates[1];
    const long = item.location.coordinates[0];
    const mapUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${long}&travelmode=walking`;

    return {
      type: 'bubble' as const,
      hero: {
        type: 'image',
        url: item.shopImage,
        size: 'full',
        aspectRatio: '20:13',
        aspectMode: 'cover',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'text',
            text: item.shopName,
            weight: 'bold',
            size: 'lg',
            wrap: true,
          },
          {
            type: 'text',
            text: item.shopCategory || '',
            color: '#999999',
          },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'sm',
            spacing: 'xs',
            contents: [
              {
                type: 'box',
                layout: 'baseline',
                contents: [
                  {
                    type: 'text',
                    text: 'สถานที่',
                    weight: 'bold',
                    flex: 3,
                    size: 'xs',
                    color: '#555555',
                  },
                  {
                    type: 'text',
                    text: item.locationName || '-',
                    flex: 5,
                    color: '#888888',
                    size: 'sm',
                    wrap: true,
                  },
                ],
              },
              {
                type: 'box',
                layout: 'baseline',
                contents: [
                  {
                    type: 'text',
                    text: 'ช่วงราคา',
                    weight: 'bold',
                    flex: 3,
                    size: 'xs',
                    color: '#555555',
                  },
                  {
                    type: 'text',
                    text: this.getPriceLevel(item.price),
                    flex: 5,
                    color: '#888888',
                    size: 'sm',
                  },
                ],
              },
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            height: 'sm',
            action: {
              type: 'uri',
              label: 'ดูเส้นทาง',
              uri: mapUrl,
            },
          },
        ],
      },
    };
  }
}
