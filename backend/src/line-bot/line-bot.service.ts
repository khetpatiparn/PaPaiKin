import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { messagingApi, webhook } from '@line/bot-sdk';
import { buffer } from 'node:stream/consumers';
import { ShopMenuItemService } from 'src/shop-menu-item/shop-menu-item.service';
import { ShopMenuItemDocument } from 'src/shop-menu-item/schema/shop-menu-item.schema';
import { GeminiService } from 'src/gemini/gemini.service';
import { FoodDiaryService } from 'src/food-diary/food-diary.service';

interface UserSession {
  currentStep:
    | 'IDLE'
    | 'Q1'
    | 'Q2'
    | 'Q3'
    | 'LOCATION'
    | 'QUICK_LOCATION'
    | 'SHOP_Q1'
    | 'SHOP_Q2'
    | 'SHOP_LOCATION';
  answers: {
    q1?: string;
    q2?: string;
    q3?: string;
  };
  shopAnswers: {
    style?: string;
    maxDistance?: number;
  };
  lastAnswers?: { q1?: string; q2?: string; q3?: string };
  lastShopAnswers?: { style?: string; maxDistance?: number };
  lastLocation?: { latitude: number; longitude: number };
}

@Injectable()
export class LineBotService {
  private readonly client: messagingApi.MessagingApiClient;
  private readonly blobClient: messagingApi.MessagingApiBlobClient;
  private sessions = new Map<string, UserSession>();

  private readonly Q1_OPTIONS = ['SINGLE_DISH', 'NOODLE', 'JAPANESE', 'SALAD'];

  constructor(
    private readonly configService: ConfigService,
    private readonly shopMenuItemService: ShopMenuItemService,
    private readonly geminiService: GeminiService,
    private readonly foodDiaryService: FoodDiaryService,
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
        shopAnswers: {},
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

        if (text === 'สุ่มด่วน') {
          session.currentStep = 'QUICK_LOCATION';
          return this.askLocation(messageEvent.replyToken!);
        }

        if (text === 'สุ่มร้าน') {
          session.currentStep = 'SHOP_Q1';
          session.shopAnswers = {};
          return this.askShopQ1(messageEvent.replyToken!);
        }

        if (text === 'สรุปมื้อ') {
          await this.animationLoading(userId, 20);
          return this.showDiarySummary(messageEvent.replyToken!, userId);
        }
      } else if (messageEvent.message.type === 'location') {
        const validSteps = ['LOCATION', 'QUICK_LOCATION', 'SHOP_LOCATION'];
        if (!validSteps.includes(session.currentStep)) {
          await this.replyText(
            messageEvent.replyToken!,
            `เลือกเมนูบน Rich menu อีกครั้งเพื่อใช้งาน`,
          );
          return;
        }

        const { latitude, longitude } = messageEvent.message;
        const replyToken = messageEvent.replyToken!;
        const step = session.currentStep;

        session.lastLocation = { latitude, longitude };
        session.currentStep = 'IDLE';

        if (step === 'QUICK_LOCATION') {
          await this.showQuickResult(
            replyToken,
            { latitude, longitude },
            userId,
          );
        } else if (step === 'SHOP_LOCATION') {
          const shopAnswers = { ...session.shopAnswers };
          session.lastShopAnswers = { ...shopAnswers };
          session.shopAnswers = {};
          await this.showShopResult(
            replyToken,
            shopAnswers,
            { latitude, longitude },
            userId,
          );
        } else {
          const answers = { ...session.answers };
          session.lastAnswers = { ...answers };
          session.answers = {};
          await this.showMenuResults(
            replyToken,
            answers,
            { latitude, longitude },
            userId,
          );
        }
      } else if (messageEvent.message.type === 'image') {
        await this.animationLoading(userId, 20);

        const stream = await this.blobClient.getMessageContent(
          messageEvent.message.id,
        );
        const buf = await buffer(stream);
        const imageBase64 = buf.toString('base64');

        const result: {
          displayText: string;
          menuName: string;
          calories: number;
          nutrients: string;
        } = await this.geminiService.analyzeFood(imageBase64);

        if (result.menuName && result.calories > 0) {
          await this.foodDiaryService.save(
            userId,
            result.menuName,
            result.calories,
            result.nutrients,
          );
        }

        await this.client.replyMessage({
          replyToken: messageEvent.replyToken!,
          messages: [{ type: 'text', text: result.displayText }],
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
                        label: '🍱 ญี่ปุ่น',
                        data: 'q1=JAPANESE',
                        displayText: 'เลือก ญี่ปุ่น',
                      },
                      height: 'sm',
                      style: 'primary',
                      color: '#D97A2B',
                    },
                    {
                      type: 'button',
                      action: {
                        type: 'postback',
                        label: '🥗 ยำ/สลัด',
                        data: 'q1=SALAD',
                        displayText: 'เลือก ยำ/สลัด',
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
                    label: '❔ อะไรก็ได้',
                    data: 'q1=ANY',
                    displayText: 'เลือก อะไรก็ได้',
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
                    label: 'บอกมาเลยดีกว่า',
                    data: 'q1=SKIP',
                    displayText: 'บอกมาเลยดีกว่า',
                  },
                  style: 'primary',
                  margin: 'md',
                  height: 'sm',
                  color: '#6B8E23',
                },
              ],
            },
            styles: {
              body: {
                backgroundColor: '#FFF8F0',
              },
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
              body: {
                backgroundColor: '#FFF8F0',
              },
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
                    data: 'q3=ANY',
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
              body: {
                backgroundColor: '#FFF8F0',
              },
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

    const action = params.get('action');

    // reshuffle actions
    if (action === 'quick_reshuffle') {
      const { lastLocation } = session;
      if (!lastLocation) return;
      return this.showQuickResult(replyToken, lastLocation, userId);
    }
    if (action === 'shop_reshuffle') {
      const { lastShopAnswers, lastLocation } = session;
      if (!lastShopAnswers || !lastLocation) return;
      return this.showShopResult(
        replyToken,
        lastShopAnswers,
        lastLocation,
        userId,
      );
    }
    if (action === 'reshuffle') {
      const { lastAnswers, lastLocation } = session;
      if (!lastAnswers?.q1 || !lastLocation) {
        session.currentStep = 'Q1';
        session.answers = {};
        return this.askQ1(replyToken);
      }
      return this.showMenuResults(
        replyToken,
        lastAnswers,
        lastLocation,
        userId,
      );
    }

    // สุ่มร้าน flow
    if (params.has('shopQ1') || params.has('shopQ2')) {
      return this.handleShopPostback(params, session, replyToken);
    }

    // สุ่มเมนู flow
    if (params.has('q1') || params.has('q2') || params.has('q3')) {
      return this.handleGuidedPostback(params, session, replyToken);
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
          '#6B8E23',
          cheapestMenu,
          (distanceCards[1] / 1000).toFixed(2),
        ),
      );
    if (nearestMenu && distanceCards[2] !== null)
      bubbles.push(
        this.buildMenuBubble(
          'เมนูใกล้ฉัน',
          '#A0522D',
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
            text: 'ชอบรึป่าว? 🤔 กดสุ่มใหม่ได้นะ',
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

  private async showQuickResult(
    replyToken: string,
    location: { latitude: number; longitude: number },
    userId: string,
  ): Promise<void> {
    await this.animationLoading(userId, 20);

    const { items, distances } =
      await this.shopMenuItemService.getQuickMenu(location);

    const bubbles: any[] = items.map((item, i) =>
      this.buildMenuBubble(
        undefined,
        undefined,
        item,
        (distances[i] / 1000).toFixed(2),
      ),
    );

    const reshuffleQuickReply: messagingApi.QuickReply = {
      items: [
        {
          type: 'action',
          action: {
            type: 'postback',
            label: 'สุ่มใหม่',
            data: 'action=quick_reshuffle',
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
            altText: 'ผลสุ่มด่วน',
            contents: { type: 'carousel', contents: bubbles },
          },
          {
            type: 'text',
            text: 'ชอบรึป่าว? 🤔 กดสุ่มใหม่ได้นะ',
            quickReply: reshuffleQuickReply,
          },
        ],
      });
    }
  }

  private async handleGuidedPostback(
    params: URLSearchParams,
    session: UserSession,
    replyToken: string,
  ) {
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
      }
      session.answers.q1 =
        q1Value === 'ANY' ? this.pickRandom(this.Q1_OPTIONS) : q1Value;
      session.currentStep = 'Q2';
      await this.askQ2(replyToken);
    } else if (params.has('q2')) {
      const q2Value = params.get('q2')!;
      session.answers.q2 = q2Value === 'ANY' ? undefined : q2Value;
      session.currentStep = 'Q3';
      await this.askQ3(replyToken);
    } else if (params.has('q3')) {
      const q3Value = params.get('q3')!;
      session.answers.q3 = q3Value === 'ANY' ? undefined : q3Value;
      session.currentStep = 'LOCATION';
      await this.askLocation(replyToken);
    }
  }

  private async handleShopPostback(
    params: URLSearchParams,
    session: UserSession,
    replyToken: string,
  ) {
    if (params.has('shopQ1') && session.currentStep !== 'SHOP_Q1') return;
    if (params.has('shopQ2') && session.currentStep !== 'SHOP_Q2') return;

    if (params.has('shopQ1')) {
      const styleValue = params.get('shopQ1')!;
      if (styleValue === 'SKIP') {
        session.shopAnswers.style = undefined;
        session.shopAnswers.maxDistance = undefined;
        session.currentStep = 'SHOP_LOCATION';
        await this.askLocation(replyToken);
        return;
      }
      session.shopAnswers.style = styleValue === 'ANY' ? undefined : styleValue;
      session.currentStep = 'SHOP_Q2';
      await this.askShopQ2(replyToken);
    } else if (params.has('shopQ2')) {
      const distValue = params.get('shopQ2')!;
      session.shopAnswers.maxDistance =
        distValue === 'ANY' ? undefined : Number(distValue);
      session.currentStep = 'SHOP_LOCATION';
      await this.askLocation(replyToken);
    }
  }

  private async askShopQ1(replyToken: string) {
    await this.client.replyMessage({
      replyToken,
      messages: [
        {
          type: 'flex',
          altText: 'ชอบร้านสไตล์ไหน?',
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
                  text: 'เลือกสไตล์ร้านอาหาร',
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
                      width: '50%',
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
                        label: '🍚 ตามสั่ง',
                        data: 'shopQ1=THAI',
                        displayText: 'เลือก ตามสั่ง',
                      },
                      style: 'primary',
                      height: 'sm',
                      color: '#D97A2B',
                    },
                    {
                      type: 'button',
                      action: {
                        type: 'postback',
                        label: '🍣 ญี่ปุ่น',
                        data: 'shopQ1=JAPANESE',
                        displayText: 'เลือก ญี่ปุ่น',
                      },
                      style: 'primary',
                      height: 'sm',
                      color: '#D97A2B',
                      margin: 'md',
                    },
                  ],
                  margin: 'md',
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    {
                      type: 'button',
                      action: {
                        type: 'postback',
                        label: '🌶️ อีสาน',
                        data: 'shopQ1=ISAN',
                        displayText: 'เลือก อีสาน',
                      },
                      style: 'primary',
                      height: 'sm',
                      color: '#D97A2B',
                    },
                    {
                      type: 'button',
                      action: {
                        type: 'postback',
                        label: '🧆 ฮาลาล',
                        data: 'shopQ1=HALAL',
                        displayText: 'เลือก ฮาลาล',
                      },
                      style: 'primary',
                      height: 'sm',
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
                    label: '❔ อะไรก็ได้',
                    data: 'shopQ1=ANY',
                    displayText: 'เลือก อะไรก็ได้',
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
                    label: 'บอกมาเลยดีกว่า',
                    data: 'shopQ1=SKIP',
                    displayText: 'บอกมาเลยดีกว่า',
                  },
                  style: 'primary',
                  margin: 'md',
                  height: 'sm',
                  color: '#6B8E23',
                },
              ],
            },
            styles: {
              body: {
                backgroundColor: '#FFF8F0',
              },
              footer: {
                separator: true,
              },
            },
          },
        },
      ],
    });
  }

  private async askShopQ2(replyToken: string) {
    await this.client.replyMessage({
      replyToken,
      messages: [
        {
          type: 'flex',
          altText: 'อยากไปไกลแค่ไหน?',
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
                  text: 'อยากไปไกลแค่ไหน?',
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
                      width: '100%',
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
                    label: '🚶 ใกล้ๆ (500m)',
                    data: 'shopQ2=500',
                    displayText: 'เลือก ใกล้ๆ 500m',
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
                    label: '🚲 เดินได้ (1km)',
                    data: 'shopQ2=1000',
                    displayText: 'เลือก เดินได้ 1km',
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
                    label: '❔ ไม่จำกัด',
                    data: 'shopQ2=ANY',
                    displayText: 'เลือก ไม่จำกัด',
                  },
                  height: 'sm',
                  style: 'primary',
                  color: '#D97A2B',
                  margin: 'md',
                },
              ],
            },
            styles: {
              body: {
                backgroundColor: '#FFF8F0',
              },
              footer: {
                separator: true,
              },
            },
          },
        },
      ],
    });
  }

  private async showShopResult(
    replyToken: string,
    shopAnswers: { style?: string; maxDistance?: number },
    location: { latitude: number; longitude: number },
    userId: string,
  ): Promise<void> {
    await this.animationLoading(userId, 20);

    const { shops, distances } = await this.shopMenuItemService.getRandomShops(
      shopAnswers.style,
      shopAnswers.maxDistance,
      location,
    );

    const bubbles: any[] = shops.map((shop, i) =>
      this.buildRestaurantBubble(shop, (distances[i] / 1000).toFixed(2)),
    );

    const reshuffleQuickReply: messagingApi.QuickReply = {
      items: [
        {
          type: 'action',
          action: {
            type: 'postback',
            label: 'สุ่มร้านใหม่',
            data: 'action=shop_reshuffle',
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
            altText: 'ผลการสุ่มร้าน',
            contents: { type: 'carousel', contents: bubbles },
          },
          {
            type: 'text',
            text: 'ร้านนี้เป็นไง? 🤔 กดสุ่มร้านใหม่ได้นะ',
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
            text: 'ไม่พบร้านที่ตรงกับเงื่อนไข ลองสุ่มใหม่อีกครั้ง',
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

  private transformCloudinaryUrl(url: string): string {
    if (!url) return url;
    return url.replace('/upload/', '/upload/w_800,q_auto,f_auto/');
  }

  private buildMenuBubble(
    tag: string | undefined,
    colorTag: string | undefined,
    menu: ShopMenuItemDocument,
    distanceKm: string,
  ) {
    const tagBox = tag
      ? [
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
        ]
      : [];

    return {
      type: 'bubble' as const,
      styles: { body: { backgroundColor: '#FFF8F0' } },
      hero: {
        type: 'image',
        url: this.transformCloudinaryUrl(menu.menuImage),
        size: 'full',
        aspectRatio: '20:13',
        aspectMode: 'cover',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          ...tagBox,
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
        backgroundColor: '#FFF8F0',
        contents: [
          {
            type: 'button',
            style: 'primary',
            height: 'sm',
            color: '#D97A2B',
            action: {
              type: 'postback',
              label: '🍽️ แนะนำร้าน',
              data: `viewShops=${menu.menuId.toString()}`,
              displayText: `แนะนำร้าน ${menu.menuName}`,
            },
          },
          {
            type: 'button',
            style: 'primary',
            height: 'sm',
            color: '#6B8E23',
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

  private buildRestaurantBubble(item: ShopMenuItemDocument, distance?: string) {
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

    if (distance) {
      (bodyContents[2] as any).contents.push({
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
            text: `${distance} กม.`,
            flex: 5,
            color: '#888888',
            size: 'sm',
          },
        ],
      });
    }

    return {
      type: 'bubble' as const,
      styles: { body: { backgroundColor: '#FFF8F0' } },
      hero: {
        type: 'image',
        url: this.transformCloudinaryUrl(item.shopImage),
        size: 'full',
        aspectRatio: '20:13',
        aspectMode: 'cover',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        backgroundColor: '#FFF8F0',
        contents: bodyContents,
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        backgroundColor: '#FFF8F0',
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

  private async showDiarySummary(
    replyToken: string,
    userId: string,
  ): Promise<void> {
    const entries = await this.foodDiaryService.getTodaySummary(userId);

    if (entries.length === 0) {
      await this.replyText(
        replyToken,
        'วันนี้ยังไม่มีบันทึกมื้ออาหาร\nลองส่งรูปอาหารมาให้ดูสิ!',
      );
      return;
    }

    const totalCalories = entries.reduce((sum, e) => sum + e.calories, 0);

    const mealRows: any[] = entries.map((entry, i) => ({
      type: 'box',
      layout: 'horizontal',
      contents: [
        {
          type: 'text',
          text: `${i + 1}.`,
          flex: 1,
          size: 'sm',
          color: '#555555',
        },
        {
          type: 'text',
          text: entry.menuName,
          flex: 5,
          size: 'sm',
          wrap: true,
        },
        {
          type: 'text',
          text: `${entry.calories}`,
          flex: 2,
          size: 'sm',
          align: 'end',
          color: '#D97A2B',
          weight: 'bold',
        },
      ],
      margin: 'sm',
    }));

    const today = new Date();
    const dateStr = `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear() + 543}`;

    await this.client.replyMessage({
      replyToken,
      messages: [
        {
          type: 'flex',
          altText: `สรุปมื้อวันนี้: ${totalCalories} kcal`,
          contents: {
            type: 'bubble',
            body: {
              type: 'box',
              layout: 'vertical',
              backgroundColor: '#FFF8F0',
              contents: [
                {
                  type: 'text',
                  text: `สรุปมื้อวันนี้`,
                  color: '#C44A3A',
                  weight: 'bold',
                  size: 'xl',
                },
                {
                  type: 'text',
                  text: dateStr,
                  color: '#999999',
                  size: 'sm',
                },
                { type: 'separator', margin: 'lg' },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    {
                      type: 'text',
                      text: '#',
                      flex: 1,
                      size: 'xs',
                      color: '#999999',
                    },
                    {
                      type: 'text',
                      text: 'เมนู',
                      flex: 5,
                      size: 'xs',
                      color: '#999999',
                    },
                    {
                      type: 'text',
                      text: 'kcal',
                      flex: 2,
                      size: 'xs',
                      color: '#999999',
                      align: 'end',
                    },
                  ],
                  margin: 'lg',
                },
                ...mealRows,
                { type: 'separator', margin: 'lg' },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    {
                      type: 'text',
                      text: 'รวมวันนี้',
                      weight: 'bold',
                      size: 'md',
                      flex: 6,
                    },
                    {
                      type: 'text',
                      text: `${totalCalories} kcal`,
                      weight: 'bold',
                      size: 'md',
                      flex: 3,
                      align: 'end',
                      color: '#D97A2B',
                    },
                  ],
                  margin: 'lg',
                },
              ],
            },
          },
        },
      ],
    });
  }
}
