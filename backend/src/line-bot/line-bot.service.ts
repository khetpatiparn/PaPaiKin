import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { messagingApi, webhook } from '@line/bot-sdk';
import { buffer } from 'node:stream/consumers';
import { ShopMenuItemService } from 'src/shop-menu-item/shop-menu-item.service';
import { ShopMenuItemDocument } from 'src/shop-menu-item/schema/shop-menu-item.schema';
import { GeminiService } from 'src/gemini/gemini.service';
import { FoodDiaryService } from 'src/food-diary/food-diary.service';
import { UserProfileService } from 'src/user-profile/user-profile.service';
import { AiAgentService, AgentResponse } from 'src/ai-agent/ai-agent.service';

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
    | 'SHOP_LOCATION'
    | 'AGENT_LOCATION'
    | 'ONBOARD_GOAL'
    | 'ONBOARD_GENDER'
    | 'ONBOARD_AGE'
    | 'ONBOARD_WEIGHT'
    | 'ONBOARD_HEIGHT'
    | 'ONBOARD_ACTIVITY'
    | 'ONBOARD_BODY_FAT';
  profileChecked: boolean;
  pendingAgentMessage?: string;
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
  onboardData?: {
    goal?: string;
    gender?: string;
    age?: number;
    weight?: number;
    height?: number;
    activityLevel?: string;
    bodyFatRange?: string;
  };
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
    private readonly userProfileService: UserProfileService,
    private readonly aiAgentService: AiAgentService,
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
        profileChecked: false,
        answers: {},
        shopAnswers: {},
      };
      this.sessions.set(userId, session);
    }

    // ตรวจ profile ครั้งแรก (เฉพาะเมื่อยังไม่เคยเช็ค และไม่ได้อยู่ใน onboarding)
    if (!session.profileChecked && !session.currentStep.startsWith('ONBOARD')) {
      const profile = await this.userProfileService.findByLineUserId(userId);
      if (!profile) {
        session.currentStep = 'ONBOARD_GOAL';
        session.onboardData = {};
        const replyToken =
          event.type === 'message' || event.type === 'postback'
            ? ((event as { replyToken?: string }).replyToken ?? null)
            : null;
        if (replyToken) return this.startOnboarding(replyToken, userId);
        return;
      }
      session.profileChecked = true;
    }

    if (event.type === 'message') {
      const messageEvent = event;

      if (messageEvent.message.type === 'text') {
        const text = messageEvent.message.text;

        // จัดการ onboarding text input (อายุ น้ำหนัก ส่วนสูง)
        if (session.currentStep.startsWith('ONBOARD')) {
          await this.handleOnboardingText(
            messageEvent.replyToken!,
            userId,
            text,
          );
          return;
        }

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

        // Free-text → AI Agent (เฉพาะเมื่ออยู่ใน IDLE)
        if (session.currentStep === 'IDLE') {
          await this.animationLoading(userId, 20);
          await this.handleAgentChat(
            messageEvent.replyToken!,
            userId,
            text,
            session,
          );
          return;
        }
      } else if (messageEvent.message.type === 'location') {
        const validSteps = [
          'LOCATION',
          'QUICK_LOCATION',
          'SHOP_LOCATION',
          'AGENT_LOCATION',
        ];
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

        if (step === 'AGENT_LOCATION') {
          const pending = session.pendingAgentMessage ?? '';
          session.pendingAgentMessage = undefined;
          await this.animationLoading(userId, 20);
          await this.handleAgentChat(replyToken, userId, pending, session);
          return;
        } else if (step === 'QUICK_LOCATION') {
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

        const result = await this.geminiService.analyzeFood(imageBase64);

        // save พร้อม mealType ที่คำนวณจากเวลาปัจจุบัน
        let savedEntryId = '';
        if (result.menuName && result.calories > 0) {
          const mealType = this.foodDiaryService.getMealTypeFromTime();
          const saved = await this.foodDiaryService.save(
            userId,
            result.menuName,
            result.calories,
            result.protein,
            result.carb,
            result.fat,
            result.cuisineType,
            result.confidence,
            mealType,
          );
          savedEntryId = String(saved._id);
        }

        // ดึง running total วันนี้
        const todayEntries =
          await this.foodDiaryService.getTodaySummary(userId);
        const totalCalories = todayEntries.reduce(
          (sum, e) => sum + e.calories,
          0,
        );
        const totalProtein = todayEntries.reduce(
          (sum, e) => sum + e.protein,
          0,
        );

        await this.client.replyMessage({
          replyToken: messageEvent.replyToken!,
          messages: [
            {
              type: 'flex',
              altText: `บันทึกแล้ว! ${result.menuName}`,
              contents: {
                type: 'bubble',
                size: 'kilo',
                body: {
                  type: 'box',
                  layout: 'vertical',
                  contents: [
                    {
                      type: 'text',
                      text: '✅ บันทึกแล้ว!',
                      weight: 'bold',
                      size: 'md',
                      color: '#1DB446',
                    },
                    {
                      type: 'text',
                      text: result.menuName,
                      size: 'lg',
                      weight: 'bold',
                      margin: 'sm',
                      wrap: true,
                    },
                    {
                      type: 'separator',
                      margin: 'lg',
                    },
                    {
                      type: 'box',
                      layout: 'vertical',
                      margin: 'lg',
                      contents: [
                        {
                          type: 'text',
                          text: `🔥 ${result.calories} kcal  🥩 โปรตีน ${result.protein}g`,
                          size: 'sm',
                          color: '#555555',
                        },
                        {
                          type: 'text',
                          text: `🍚 คาร์บ ${result.carb}g  🥑 ไขมัน ${result.fat}g`,
                          size: 'sm',
                          color: '#555555',
                          margin: 'sm',
                        },
                      ],
                    },
                    {
                      type: 'separator',
                      margin: 'lg',
                    },
                    {
                      type: 'box',
                      layout: 'vertical',
                      margin: 'lg',
                      contents: [
                        {
                          type: 'text',
                          text: `📊 วันนี้รวม: ${totalCalories} kcal  โปรตีน ${totalProtein}g`,
                          size: 'sm',
                          weight: 'bold',
                          color: '#D97A2B',
                        },
                      ],
                    },
                  ],
                },
              },
              quickReply: {
                items: [
                  {
                    type: 'action',
                    action: {
                      type: 'postback',
                      label: '🌅 เช้า',
                      data: `action=change_meal_type&entryId=${savedEntryId}&mealType=breakfast`,
                      displayText: '🌅 เช้า',
                    },
                  },
                  {
                    type: 'action',
                    action: {
                      type: 'postback',
                      label: '☀️ เที่ยง',
                      data: `action=change_meal_type&entryId=${savedEntryId}&mealType=lunch`,
                      displayText: '☀️ เที่ยง',
                    },
                  },
                  {
                    type: 'action',
                    action: {
                      type: 'postback',
                      label: '🌙 เย็น',
                      data: `action=change_meal_type&entryId=${savedEntryId}&mealType=dinner`,
                      displayText: '🌙 เย็น',
                    },
                  },
                  {
                    type: 'action',
                    action: {
                      type: 'postback',
                      label: '🍪 ของว่าง',
                      data: `action=change_meal_type&entryId=${savedEntryId}&mealType=snack`,
                      displayText: '🍪 ของว่าง',
                    },
                  },
                ],
              },
            },
          ],
        });
      }
    } else if (event.type === 'postback') {
      const postbackEvent = event;
      return this.handlePostback(
        postbackEvent.replyToken!,
        userId,
        postbackEvent.postback.data,
      );
    } else if (event.type === 'follow') {
      const profile = await this.userProfileService.findByLineUserId(userId);
      if (!profile) {
        session.currentStep = 'ONBOARD_GOAL';
        session.onboardData = {};
        return this.startOnboarding(event.replyToken, userId);
      }
      session.profileChecked = true;
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

    // onboarding
    if (action === 'onboard') {
      return this.handleOnboardingPostback(replyToken, userId, params);
    }

    // เปลี่ยนมื้ออาหาร
    if (action === 'change_meal_type') {
      const entryId = params.get('entryId');
      const mealType = params.get('mealType');
      if (entryId && mealType) {
        await this.foodDiaryService.updateMealType(entryId, mealType);
      }
      return;
    }

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

    const connectUrl = process.env.SERVER_URL!;

    const totalCalories = entries.reduce((sum, e) => sum + e.calories, 0);
    const totalProtein = entries.reduce((sum, e) => sum + e.protein, 0);

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
          text: `${entry.protein}`,
          flex: 2,
          size: 'sm',
          color: '#D97A2B',
          weight: 'bold',
          align: 'end',
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
            type: 'bubble' as const,
            body: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: 'สรุปมื้อวันนี้',
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
                {
                  type: 'separator',
                  margin: 'lg',
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    {
                      type: 'text',
                      text: `#`,
                      color: '#999999',
                      flex: 1,
                      size: 'sm',
                    },
                    {
                      type: 'text',
                      text: 'เมนู',
                      color: '#999999',
                      flex: 5,
                      size: 'sm',
                      wrap: true,
                    },
                    {
                      type: 'text',
                      text: `Protein`,
                      color: '#999999',
                      flex: 2,
                      size: 'sm',
                      align: 'end',
                    },
                    {
                      type: 'text',
                      text: `kcal`,
                      flex: 2,
                      size: 'sm',
                      align: 'end',
                      color: '#999999',
                    },
                  ],
                },
                ...mealRows,
                {
                  type: 'separator',
                  margin: 'lg',
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    {
                      type: 'text',
                      text: 'รวมวันนี้',
                      size: 'md',
                      weight: 'bold',
                      flex: 6,
                    },
                    {
                      type: 'text',
                      text: `${totalProtein} g`,
                      flex: 2,
                      size: 'md',
                      color: '#D97A2B',
                      weight: 'bold',
                      align: 'end',
                    },
                    {
                      type: 'text',
                      text: `${totalCalories} kcal`,
                      size: 'md',
                      color: '#D97A2B',
                      weight: 'bold',
                      flex: 4,
                      align: 'end',
                    },
                  ],
                  margin: 'lg',
                },
                {
                  type: 'separator',
                },
                {
                  type: 'button',
                  style: 'primary',
                  height: 'sm',
                  action: {
                    type: 'uri',
                    label: 'ดูประวัติการกิน',
                    uri: connectUrl,
                  },
                  color: '#A0522D',
                  margin: 'lg',
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

  // ─── Onboarding ──────────────────────────────────────────────

  private async startOnboarding(replyToken: string, userId: string) {
    const session = this.sessions.get(userId)!;
    session.currentStep = 'ONBOARD_GOAL';
    await this.client.replyMessage({
      replyToken,
      messages: [
        {
          type: 'text',
          text: '👋 สวัสดี! ขอถามข้อมูลสั้นๆ 7 ขั้นตอนเพื่อคำนวณเป้าหมายแคลอรี่ส่วนตัวของคุณนะ\n\n📌 ขั้นที่ 1/7\nเป้าหมายของคุณคืออะไร?',
          quickReply: {
            items: [
              {
                type: 'action',
                action: {
                  type: 'postback',
                  label: '⬇️ ลดน้ำหนัก',
                  data: 'action=onboard&step=goal&value=lose',
                  displayText: 'ลดน้ำหนัก',
                },
              },
              {
                type: 'action',
                action: {
                  type: 'postback',
                  label: '⚖️ คงน้ำหนัก',
                  data: 'action=onboard&step=goal&value=maintain',
                  displayText: 'คงน้ำหนัก',
                },
              },
              {
                type: 'action',
                action: {
                  type: 'postback',
                  label: '⬆️ เพิ่มน้ำหนัก',
                  data: 'action=onboard&step=goal&value=gain',
                  displayText: 'เพิ่มน้ำหนัก',
                },
              },
            ],
          },
        },
      ],
    });
  }

  private async handleOnboardingPostback(
    replyToken: string,
    userId: string,
    params: URLSearchParams,
  ) {
    const session = this.sessions.get(userId)!;
    const step = params.get('step');
    const value = params.get('value');
    if (!step || !value || !session.onboardData) return;

    switch (step) {
      case 'goal':
        session.onboardData.goal = value;
        session.currentStep = 'ONBOARD_GENDER';
        await this.client.replyMessage({
          replyToken,
          messages: [
            {
              type: 'text',
              text: '📌 ขั้นที่ 2/7\nเพศของคุณ?',
              quickReply: {
                items: [
                  {
                    type: 'action',
                    action: {
                      type: 'postback',
                      label: '👨 ชาย',
                      data: 'action=onboard&step=gender&value=male',
                      displayText: 'ชาย',
                    },
                  },
                  {
                    type: 'action',
                    action: {
                      type: 'postback',
                      label: '👩 หญิง',
                      data: 'action=onboard&step=gender&value=female',
                      displayText: 'หญิง',
                    },
                  },
                ],
              },
            },
          ],
        });
        break;

      case 'gender':
        session.onboardData.gender = value;
        session.currentStep = 'ONBOARD_AGE';
        await this.replyText(
          replyToken,
          '📌 ขั้นที่ 3/7\nอายุกี่ปี? (พิมพ์ตัวเลข เช่น 22)',
        );
        break;

      case 'activity':
        session.onboardData.activityLevel = value;
        session.currentStep = 'ONBOARD_BODY_FAT';
        await this.client.replyMessage({
          replyToken,
          messages: [
            {
              type: 'text',
              text: '📌 ขั้นที่ 7/7\n% ไขมันในร่างกาย (ถ้าไม่รู้กด "ข้าม")',
              quickReply: {
                items: [
                  {
                    type: 'action',
                    action: {
                      type: 'postback',
                      label: 'ข้าม',
                      data: 'action=onboard&step=bodyFat&value=skip',
                      displayText: 'ข้าม',
                    },
                  },
                  {
                    type: 'action',
                    action: {
                      type: 'postback',
                      label: '10-15%',
                      data: 'action=onboard&step=bodyFat&value=10-15%',
                      displayText: '10-15%',
                    },
                  },
                  {
                    type: 'action',
                    action: {
                      type: 'postback',
                      label: '16-20%',
                      data: 'action=onboard&step=bodyFat&value=16-20%',
                      displayText: '16-20%',
                    },
                  },
                  {
                    type: 'action',
                    action: {
                      type: 'postback',
                      label: '21-25%',
                      data: 'action=onboard&step=bodyFat&value=21-25%',
                      displayText: '21-25%',
                    },
                  },
                  {
                    type: 'action',
                    action: {
                      type: 'postback',
                      label: '26-30%',
                      data: 'action=onboard&step=bodyFat&value=26-30%',
                      displayText: '26-30%',
                    },
                  },
                  {
                    type: 'action',
                    action: {
                      type: 'postback',
                      label: '31%+',
                      data: 'action=onboard&step=bodyFat&value=31%+',
                      displayText: '31%+',
                    },
                  },
                ],
              },
            },
          ],
        });
        break;

      case 'bodyFat':
        session.onboardData.bodyFatRange = value === 'skip' ? '' : value;
        return this.completeOnboarding(replyToken, userId);
    }
  }

  private async handleOnboardingText(
    replyToken: string,
    userId: string,
    text: string,
  ) {
    const session = this.sessions.get(userId)!;

    switch (session.currentStep) {
      case 'ONBOARD_AGE': {
        const age = parseInt(text, 10);
        if (isNaN(age) || age < 10 || age > 120) {
          return this.replyText(
            replyToken,
            '⚠️ กรุณาพิมพ์อายุเป็นตัวเลข เช่น 22',
          );
        }
        session.onboardData!.age = age;
        session.currentStep = 'ONBOARD_WEIGHT';
        return this.replyText(
          replyToken,
          '📌 ขั้นที่ 4/7\nน้ำหนักกี่ กก.? (พิมพ์ตัวเลข เช่น 65)',
        );
      }
      case 'ONBOARD_WEIGHT': {
        const weight = parseFloat(text);
        if (isNaN(weight) || weight < 20 || weight > 300) {
          return this.replyText(
            replyToken,
            '⚠️ กรุณาพิมพ์น้ำหนักเป็นตัวเลข เช่น 65',
          );
        }
        session.onboardData!.weight = weight;
        session.currentStep = 'ONBOARD_HEIGHT';
        return this.replyText(
          replyToken,
          '📌 ขั้นที่ 5/7\nส่วนสูงกี่ ซม.? (พิมพ์ตัวเลข เช่น 170)',
        );
      }
      case 'ONBOARD_HEIGHT': {
        const height = parseFloat(text);
        if (isNaN(height) || height < 50 || height > 250) {
          return this.replyText(
            replyToken,
            '⚠️ กรุณาพิมพ์ส่วนสูงเป็นตัวเลข เช่น 170',
          );
        }
        session.onboardData!.height = height;
        session.currentStep = 'ONBOARD_ACTIVITY';
        return this.client.replyMessage({
          replyToken,
          messages: [
            {
              type: 'text',
              text: '📌 ขั้นที่ 6/7\nระดับกิจกรรมในชีวิตประจำวัน?',
              quickReply: {
                items: [
                  {
                    type: 'action',
                    action: {
                      type: 'postback',
                      label: '🪑 นั่งโต๊ะ',
                      data: 'action=onboard&step=activity&value=sedentary',
                      displayText: 'นั่งโต๊ะเป็นส่วนใหญ่',
                    },
                  },
                  {
                    type: 'action',
                    action: {
                      type: 'postback',
                      label: '🚶 เดินเบาๆ',
                      data: 'action=onboard&step=activity&value=light',
                      displayText: 'เดินเบาๆ บางวัน',
                    },
                  },
                  {
                    type: 'action',
                    action: {
                      type: 'postback',
                      label: '🏃 ออกกำลังสม่ำเสมอ',
                      data: 'action=onboard&step=activity&value=moderate',
                      displayText: 'ออกกำลังสม่ำเสมอ',
                    },
                  },
                  {
                    type: 'action',
                    action: {
                      type: 'postback',
                      label: '💪 ออกกำลังหนัก',
                      data: 'action=onboard&step=activity&value=very_active',
                      displayText: 'ออกกำลังหนักมาก',
                    },
                  },
                ],
              },
            },
          ],
        });
      }
      default:
        // ขั้นอื่นที่ใช้ quick reply ไม่ใช่ text
        return this.replyText(replyToken, '⚠️ กรุณากดปุ่มเพื่อเลือก');
    }
  }

  private async completeOnboarding(replyToken: string, userId: string) {
    const session = this.sessions.get(userId)!;
    const data = session.onboardData!;

    if (
      !data.goal ||
      !data.gender ||
      data.age === undefined ||
      data.weight === undefined ||
      data.height === undefined ||
      !data.activityLevel
    ) {
      return this.replyText(replyToken, 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    }

    const profile = await this.userProfileService.createOrUpdate({
      lineUserId: userId,
      goal: data.goal as 'lose' | 'maintain' | 'gain',
      gender: data.gender as 'male' | 'female',
      age: data.age,
      weight: data.weight,
      height: data.height,
      activityLevel: data.activityLevel as
        | 'sedentary'
        | 'light'
        | 'moderate'
        | 'very_active',
      bodyFatRange: data.bodyFatRange ?? '',
    });

    session.profileChecked = true;
    session.currentStep = 'IDLE';
    session.onboardData = undefined;

    const goalLabel: Record<string, string> = {
      lose: 'ลดน้ำหนัก',
      maintain: 'คงน้ำหนัก',
      gain: 'เพิ่มน้ำหนัก',
    };

    await this.replyText(
      replyToken,
      `✅ ตั้งค่าเสร็จแล้ว!\n\n🎯 เป้าหมาย: ${goalLabel[data.goal]}\n🔥 แคลอรี่ต่อวัน: ${profile.dailyCalorieGoal} kcal\n🥩 โปรตีน: ${profile.dailyProteinGoal}g\n🍚 คาร์บ: ${profile.dailyCarbGoal}g\n🥑 ไขมัน: ${profile.dailyFatGoal}g\n\nเริ่มได้เลย! ถ่ายรูปอาหารแล้วส่งมาเลย 📸`,
    );
  }

  private async handleAgentChat(
    replyToken: string,
    userId: string,
    userMessage: string,
    session: UserSession,
  ): Promise<void> {
    const location = session.lastLocation
      ? {
          lat: session.lastLocation.latitude,
          lng: session.lastLocation.longitude,
        }
      : undefined;

    let agentResponse: AgentResponse;
    try {
      agentResponse = await this.aiAgentService.chat(
        userId,
        userMessage,
        location,
      );
    } catch {
      await this.replyText(
        replyToken,
        'ขออภัย เกิดข้อผิดพลาด ลองใหม่อีกครั้งนะ',
      );
      return;
    }

    // Agent บอกว่าต้องการ location แต่ยังไม่มี → เก็บ pending แล้วขอ location
    if (agentResponse.needsLocation && !location) {
      session.currentStep = 'AGENT_LOCATION';
      session.pendingAgentMessage = userMessage;
      await this.client.replyMessage({
        replyToken,
        messages: [
          {
            type: 'text',
            text: `${agentResponse.summary}\n\nแชร์ตำแหน่งเพื่อหาร้านใกล้คุณได้เลย 📍`,
            quickReply: {
              items: [
                {
                  type: 'action',
                  action: { type: 'location', label: '📍 แชร์ตำแหน่ง' },
                },
              ],
            },
          },
        ],
      });
      return;
    }

    const messages: any[] = [
      { type: 'text', text: agentResponse.summary || 'ไม่มีข้อมูล' },
    ];

    if (agentResponse.restaurants.length > 0) {
      messages.push({
        type: 'flex',
        altText: 'ร้านอาหารแนะนำ',
        contents: {
          type: 'carousel',
          contents: agentResponse.restaurants.map((r) =>
            this.buildAgentRestaurantBubble(r),
          ),
        },
      });
    }

    await this.client.replyMessage({ replyToken, messages });
  }

  private buildAgentRestaurantBubble(
    restaurant: AgentResponse['restaurants'][number],
  ) {
    const mapUrl = `https://www.google.com/maps/dir/?api=1&destination=${restaurant.lat},${restaurant.lng}&travelmode=walking`;
    const priceLevelText =
      (['ฟรี', '฿', '฿฿', '฿฿฿', '฿฿฿฿'] as const)[restaurant.priceLevel] ??
      '-';
    const openText =
      restaurant.isOpenNow === true
        ? '🟢 เปิดอยู่'
        : restaurant.isOpenNow === false
          ? '🔴 ปิดแล้ว'
          : '-';

    return {
      type: 'bubble' as const,
      styles: { body: { backgroundColor: '#FFF8F0' } },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        backgroundColor: '#FFF8F0',
        contents: [
          {
            type: 'text',
            text: restaurant.name,
            weight: 'bold',
            size: 'lg',
            wrap: true,
          },
          {
            type: 'text',
            text: restaurant.vicinity || '-',
            color: '#999999',
            size: 'sm',
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
                    text: '⭐ คะแนน',
                    weight: 'bold',
                    flex: 3,
                    size: 'xs',
                    color: '#555555',
                  },
                  {
                    type: 'text',
                    text: restaurant.rating ? String(restaurant.rating) : '-',
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
                    text: '💰 ราคา',
                    weight: 'bold',
                    flex: 3,
                    size: 'xs',
                    color: '#555555',
                  },
                  {
                    type: 'text',
                    text: priceLevelText,
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
                    text: '🕐 สถานะ',
                    weight: 'bold',
                    flex: 3,
                    size: 'xs',
                    color: '#555555',
                  },
                  {
                    type: 'text',
                    text: openText,
                    flex: 5,
                    size: 'sm',
                    color: '#888888',
                  },
                ],
              },
              { type: 'separator', margin: 'sm' },
              {
                type: 'text',
                text: restaurant.reason,
                size: 'sm',
                color: '#D97A2B',
                wrap: true,
                margin: 'sm',
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
            action: { type: 'uri', label: 'ดูเส้นทาง', uri: mapUrl },
          },
        ],
      },
    };
  }
}
