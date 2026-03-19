import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { messagingApi, webhook } from '@line/bot-sdk';
import { buffer } from 'node:stream/consumers';
import { ShopMenuItemService } from 'src/shop-menu-item/shop-menu-item.service';
import { ShopMenuItemDocument } from 'src/shop-menu-item/schema/shop-menu-item.schema';
import { GeminiService } from 'src/gemini/gemini.service';

interface UserSession {
  currentStep: 'IDLE' | 'Q1' | 'Q2' | 'Q3' | 'LOCATION';
  answers: {
    q1?: string;
    q2?: string;
    q3?: string;
  };
  lastAnswers?: { q1?: string; q2?: string; q3?: string };
  lastLocation?: { latitude: number; longitude: number };
}

@Injectable()
export class LineBotService {
  private readonly client: messagingApi.MessagingApiClient;
  private readonly blobClient: messagingApi.MessagingApiBlobClient;
  private sessions = new Map<string, UserSession>();

  private readonly Q1_OPTIONS = ['SINGLE_DISH', 'NOODLE', 'SIDE_DISH'];

  constructor(
    private readonly configService: ConfigService,
    private readonly shopMenuItemService: ShopMenuItemService,
    private readonly geminiService: GeminiService,
  ) {
    const channelAccessToken = this.configService.get<string>(
      'LINE_CHANNEL_ACCESS_TOKEN',
    )!;

    this.client = new messagingApi.MessagingApiClient({
      channelAccessToken,
    });

    this.blobClient = new messagingApi.MessagingApiBlobClient({
      channelAccessToken,
    });
  }

  private async animationLoading(userId: string, loadingSec: number) {
    await this.client.showLoadingAnimation({
      chatId: userId,
      loadingSeconds: loadingSec,
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
          await this.animationLoading(userId, 20);
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
        const replyToken = messageEvent.replyToken!;

        session.lastAnswers = { ...answers };
        session.lastLocation = { latitude, longitude };
        session.currentStep = 'IDLE';
        session.answers = {};

        await this.showMenuResults(replyToken, answers, { latitude, longitude }, userId);
      } else if (messageEvent.message.type === 'image') {
        await this.animationLoading(userId, 20);

        const stream = await this.blobClient.getMessageContent(
          messageEvent.message.id,
        );
        const buf = await buffer(stream);
        const imageBase64 = buf.toString('base64');

        const result = await this.geminiService.analyzeFood(imageBase64);

        await this.client.replyMessage({
          replyToken: messageEvent.replyToken!,
          messages: [{ type: 'text', text: result }],
        });
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
            body: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: 'คำถามข้อแรก',
                  weight: 'bold',
                  color: '#D97A2B',
                  size: 'sm',
                },
                {
                  type: 'text',
                  text: 'เลือกประเภทอาหาร',
                  weight: 'bold',
                  size: 'xl',
                  margin: 'md',
                },
                {
                  type: 'box',
                  layout: 'vertical',
                  contents: [
                    {
                      type: 'box',
                      layout: 'vertical',
                      contents: [],
                      width: '33%',
                      height: '6px',
                      backgroundColor: '#D97A2B',
                    },
                  ],
                  margin: 'sm',
                  height: '6px',
                  backgroundColor: '#F2D479',
                  cornerRadius: 'lg',
                },
                {
                  type: 'separator',
                  margin: 'xxl',
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    {
                      type: 'button',
                      action: {
                        type: 'postback',
                        label: '🍛 จานเดียว',
                        data: 'q1=SINGLE_DISH',
                        displayText: 'เลือก จานเดียว',
                      },
                      style: 'primary',
                      height: 'sm',
                      color: '#D97A2B',
                    },
                    {
                      type: 'button',
                      action: {
                        type: 'postback',
                        label: '🍜 เส้น',
                        data: 'q1=NOODLE',
                        displayText: 'เลือก เส้น',
                      },
                      style: 'primary',
                      height: 'sm',
                      color: '#D97A2B',
                      margin: 'md',
                    },
                  ],
                  margin: 'md',
                  justifyContent: 'flex-start',
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    {
                      type: 'button',
                      action: {
                        type: 'postback',
                        label: '🍴 กับข้าว',
                        data: 'q1=SIDE_DISH',
                        displayText: 'เลือก กับข้าว',
                      },
                      height: 'sm',
                      style: 'primary',
                      color: '#D97A2B',
                    },
                    {
                      type: 'button',
                      action: {
                        type: 'postback',
                        label: '❔ อะไรก็ได้',
                        data: 'q1=ANY',
                        displayText: 'เลือก อะไรก็ได้',
                      },
                      height: 'sm',
                      style: 'primary',
                      color: '#D97A2B',
                      margin: 'md',
                    },
                  ],
                  margin: 'md',
                },
                {
                  type: 'button',
                  action: {
                    type: 'postback',
                    label: 'บอกมาเลยดีกว่า',
                    data: 'q1=SKIP',
                    displayText: 'บอกมาเลยดีกว่า',
                  },
                  style: 'primary',
                  margin: 'md',
                  height: 'sm',
                  color: '#6FAF4F',
                },
              ],
            },
            styles: {
              footer: {
                separator: true,
              },
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
            body: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: 'คำถามข้อสอง',
                  weight: 'bold',
                  color: '#D97A2B',
                  size: 'sm',
                },
                {
                  type: 'text',
                  text: 'เลือกเนื้อสัตว์ที่ชอบ',
                  weight: 'bold',
                  size: 'xl',
                  margin: 'md',
                },
                {
                  type: 'box',
                  layout: 'vertical',
                  contents: [
                    {
                      type: 'box',
                      layout: 'vertical',
                      contents: [],
                      width: '66%',
                      height: '6px',
                      backgroundColor: '#D97A2B',
                    },
                  ],
                  margin: 'sm',
                  height: '6px',
                  backgroundColor: '#F2D479',
                  cornerRadius: 'lg',
                },
                {
                  type: 'separator',
                  margin: 'xxl',
                },
                {
                  type: 'button',
                  action: {
                    type: 'postback',
                    label: '🐷 หมู',
                    data: 'q2=PORK',
                    displayText: 'เลือก หมู',
                  },
                  style: 'primary',
                  height: 'sm',
                  color: '#D97A2B',
                  margin: 'md',
                },
                {
                  type: 'button',
                  action: {
                    type: 'postback',
                    label: '🐔 ไก่',
                    data: 'q2=CHICKEN',
                    displayText: 'เลือก ไก่',
                  },
                  style: 'primary',
                  height: 'sm',
                  color: '#D97A2B',
                  margin: 'md',
                },
                {
                  type: 'button',
                  action: {
                    type: 'postback',
                    label: '🥩 เนื้อ',
                    data: 'q2=BEEF',
                    displayText: 'เลือก เนื้อ',
                  },
                  height: 'sm',
                  style: 'primary',
                  color: '#D97A2B',
                  margin: 'md',
                },
                {
                  type: 'button',
                  action: {
                    type: 'postback',
                    label: '🌊 ทะเล',
                    data: 'q2=SEAFOOD',
                    displayText: 'เลือก ทะเล',
                  },
                  height: 'sm',
                  style: 'primary',
                  color: '#D97A2B',
                  margin: 'md',
                },
                {
                  type: 'button',
                  action: {
                    type: 'postback',
                    label: '🥬 มังสวิรัติ',
                    data: 'q2=VEGETARIAN',
                    displayText: 'เลือก มังสวิรัติ',
                  },
                  height: 'sm',
                  style: 'primary',
                  color: '#D97A2B',
                  margin: 'md',
                },
                {
                  type: 'button',
                  action: {
                    type: 'postback',
                    label: '❔อะไรก็ได้',
                    data: 'q2=ANY',
                    displayText: 'เลือก อะไรก็ได้',
                  },
                  height: 'sm',
                  style: 'primary',
                  color: '#D97A2B',
                  margin: 'md',
                },
              ],
            },
            size: 'mega',
            styles: {
              footer: {
                separator: true,
              },
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
            body: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: 'คำถามข้อสุดท้าย',
                  weight: 'bold',
                  color: '#D97A2B',
                  size: 'sm',
                },
                {
                  type: 'text',
                  text: 'เลือกรูปแบบที่อยากทาน',
                  weight: 'bold',
                  size: 'xl',
                  margin: 'md',
                },
                {
                  type: 'box',
                  layout: 'vertical',
                  contents: [
                    {
                      type: 'box',
                      layout: 'vertical',
                      contents: [],
                      width: '99%',
                      height: '6px',
                      backgroundColor: '#D97A2B',
                    },
                  ],
                  margin: 'sm',
                  height: '6px',
                  backgroundColor: '#F2D479',
                  cornerRadius: 'lg',
                },
                {
                  type: 'separator',
                  margin: 'xxl',
                },
                {
                  type: 'button',
                  action: {
                    type: 'postback',
                    label: 'แบบแห้ง (ผัด/ทอด/ย่าง/ยำ)',
                    data: 'q3=DRY',
                    displayText: 'เลือก แบบแห้ง',
                  },
                  height: 'sm',
                  style: 'primary',
                  color: '#D97A2B',
                  margin: 'md',
                },
                {
                  type: 'button',
                  action: {
                    type: 'postback',
                    label: 'แบบน้ำ (แกง/ต้ม/ซุป)',
                    data: 'q3=SOUP',
                    displayText: 'เลือก แบบน้ำ',
                  },
                  height: 'sm',
                  style: 'primary',
                  color: '#D97A2B',
                  margin: 'md',
                },
                {
                  type: 'button',
                  action: {
                    type: 'postback',
                    label: '❔อะไรก็ได้',
                    data: 'q2=ANY',
                    displayText: 'เลือก อะไรก็ได้',
                  },
                  height: 'sm',
                  style: 'primary',
                  color: '#D97A2B',
                  margin: 'md',
                },
              ],
            },
            size: 'mega',
            styles: {
              footer: {
                separator: true,
              },
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

    if (params.has('action') && params.get('action') === 'reshuffle') {
      const { lastAnswers, lastLocation } = session;
      if (!lastAnswers?.q1 || !lastLocation) {
        session.currentStep = 'Q1';
        session.answers = {};
        return this.askQ1(replyToken);
      }
      return this.showMenuResults(replyToken, lastAnswers, lastLocation, userId);
    }

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

      await this.animationLoading(userId, 20);
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
    } else if (params.has('viewRecipe')) {
      const menuId = params.get('viewRecipe');
      if (!menuId) return;

      await this.handleViewRecipe(replyToken, menuId, userId);
    }
    return;
  }

  private async showMenuResults(
    replyToken: string,
    answers: { q1?: string; q2?: string; q3?: string },
    location: { latitude: number; longitude: number },
    userId: string,
  ): Promise<void> {
    await this.animationLoading(userId, 20);

    const result = await this.shopMenuItemService.getGuidedMenu({
      userAnswer: { q1: answers.q1!, q2: answers.q2!, q3: answers.q3! },
      userLocation: location,
    });
    const { randomMenu, cheapestMenu, nearestMenu, distanceCards } = result;

    const bubbles: any[] = [];
    if (randomMenu && distanceCards[0] !== null)
      bubbles.push(
        this.buildMenuBubble(
          'เมนูแนะนำ',
          '#C44A3A',
          randomMenu,
          (distanceCards[0] / 1000).toFixed(2),
        ),
      );
    if (cheapestMenu && distanceCards[1] !== null)
      bubbles.push(
        this.buildMenuBubble(
          'เมนูประหยัด',
          '#6FAF4F',
          cheapestMenu,
          (distanceCards[1] / 1000).toFixed(2),
        ),
      );
    if (nearestMenu && distanceCards[2] !== null)
      bubbles.push(
        this.buildMenuBubble(
          'เมนูใกล้ฉัน',
          '#4C8CE4',
          nearestMenu,
          (distanceCards[2] / 1000).toFixed(2),
        ),
      );

    const reshuffleQuickReply: messagingApi.QuickReply = {
      items: [
        {
          type: 'action',
          action: {
            type: 'postback',
            label: 'สุ่มใหม่',
            data: 'action=reshuffle',
            displayText: 'สุ่มใหม่',
          },
        },
      ],
    };

    if (bubbles.length > 0) {
      await this.client.replyMessage({
        replyToken,
        messages: [
          {
            type: 'flex',
            altText: 'ผลการสุ่ม',
            contents: { type: 'carousel', contents: bubbles },
          },
          {
            type: 'text',
            text: 'ไม่ชอบรึป่าว? 🤔 กดสุ่มใหม่ได้เลยนะ',
            quickReply: reshuffleQuickReply,
          },
        ],
      });
    } else {
      await this.client.replyMessage({
        replyToken,
        messages: [
          {
            type: 'text',
            text: 'ไม่พบเมนู ลองสุ่มใหม่อีกครั้ง',
            quickReply: reshuffleQuickReply,
          },
        ],
      });
    }
  }

  private async handleViewRecipe(
    replyToken: string,
    menuId: string,
    userId: string,
  ): Promise<void> {
    const item = await this.shopMenuItemService.findOneByMenuId(menuId);

    if (!item) {
      await this.client.replyMessage({
        replyToken,
        messages: [{ type: 'text', text: 'ไม่พบข้อมูลเมนูนี้' }],
      });
      return;
    }

    const contextPrompt = [
      item.menuName,
      item.attributes?.ingredients?.length
        ? `วัตถุดิบ: ${item.attributes.ingredients.join(', ')}`
        : '',
      item.attributes?.cookingMethod?.length
        ? `วิธีทำ: ${item.attributes.cookingMethod.join(', ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    await this.animationLoading(userId, 10);

    const recipe = await this.geminiService.generateRecipe(contextPrompt);

    await this.client.replyMessage({
      replyToken,
      messages: [
        { type: 'text', text: `📖 สูตร: ${item.menuName}\n\n${recipe}` },
      ],
    });
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
            color: '#D97A2B',
            action: {
              type: 'postback',
              label: '🍽️ ดูร้านที่มี',
              data: `viewShops=${menu.menuId.toString()}`,
              displayText: `ดูร้านที่มี ${menu.menuName}`,
            },
          },
          {
            type: 'button',
            style: 'primary',
            height: 'sm',
            color: '#6FAF4F',
            action: {
              type: 'postback',
              label: '📖 ดูสูตร',
              data: `viewRecipe=${menu.menuId.toString()}`,
              displayText: `ดูสูตร ${menu.menuName}`,
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

    const bodyContents: any[] = [
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
    ];

    if (item.promotion) {
      bodyContents.push({
        type: 'box',
        layout: 'vertical',
        margin: 'md',
        backgroundColor: '#FFF3E0',
        cornerRadius: '8px',
        paddingAll: '10px',
        contents: [
          {
            type: 'text',
            text: `โปรโมชัน`,
            size: 'xs',
            weight: 'bold',
            color: '#C44A3A',
          },
          {
            type: 'text',
            text: item.promotion,
            size: 'sm',
            color: '#D97A2B',
            wrap: true,
            margin: 'xs',
          },
        ],
      });
    }

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
        contents: bodyContents,
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
            color: '#D97A2B',
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
