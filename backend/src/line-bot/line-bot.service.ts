import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { messagingApi, webhook } from '@line/bot-sdk';
import { buffer } from 'node:stream/consumers';
import { GeminiService } from 'src/gemini/gemini.service';
import { FoodDiaryService } from 'src/food-diary/food-diary.service';
import { UserProfileService } from 'src/user-profile/user-profile.service';
import { AiAgentService, AgentResponse } from 'src/ai-agent/ai-agent.service';
import { type Content } from '@google/genai';

interface UserSession {
  currentStep:
    | 'IDLE'
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
  agentHistory?: Content[];
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

  constructor(
    private readonly configService: ConfigService,
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
      };
      this.sessions.set(userId, session);
    }

    // onboarding
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

        //  handle onboarding text input
        if (session.currentStep.startsWith('ONBOARD')) {
          await this.handleOnboardingText(
            messageEvent.replyToken!,
            userId,
            text,
          );
          return;
        }

        // Diary Summary
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
        if (session.currentStep !== 'AGENT_LOCATION') {
          await this.replyText(
            messageEvent.replyToken!,
            `เลือกเมนูบน Rich menu อีกครั้งเพื่อใช้งาน`,
          );
          return;
        }

        const { latitude, longitude } = messageEvent.message;
        const replyToken = messageEvent.replyToken!;

        session.lastLocation = { latitude, longitude };
        session.currentStep = 'IDLE';

        const pending = session.pendingAgentMessage ?? '';
        session.pendingAgentMessage = undefined;
        await this.animationLoading(userId, 20);
        await this.handleAgentChat(replyToken, userId, pending, session);
        return;
      } else if (messageEvent.message.type === 'image') {
        await this.animationLoading(userId, 20);

        const imageBase64 = await this.fetchImageAsBase64(
          messageEvent.message.id,
        );

        const result = await this.geminiService.analyzeFood(imageBase64);

        const savedEntryId = await this.saveFoodDiaryEntry(userId, result);

        await this.replyFoodSavedCard(
          messageEvent.replyToken!,
          userId,
          result,
          savedEntryId,
        );
        // checked
      }
    } else if (event.type === 'postback') {
      const postbackEvent = event;
      return this.handlePostback(
        postbackEvent.replyToken!,
        userId,
        postbackEvent.postback.data,
        // checked
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

  private async handlePostback(
    replyToken: string,
    userId: string,
    data: string,
  ) {
    const params = new URLSearchParams(data);

    const action = params.get('action');

    if (action === 'onboard') {
      return this.handleOnboardingPostback(replyToken, userId, params);
    }

    if (action === 'change_meal_type') {
      const entryId = params.get('entryId');
      const mealType = params.get('mealType');
      if (entryId && mealType) {
        await this.foodDiaryService.updateMealType(entryId, mealType);
      }
      return;
    }

    return;
  }

  private getPlacePriceLevelText(level: number): string {
    const map: Record<number, string> = {
      1: '฿ (ต่ำกว่า 100฿)',
      2: '฿฿ (100-300฿)',
      3: '฿฿฿ (300-500฿)',
      4: '฿฿฿฿ (500฿+)',
    };
    return map[level] ?? '-';
  }

  // ─── Diary Summary  ──────────────────────────────────────────────

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
          text: '👋 สวัสดี! เราขอถามข้อมูลสั้นๆ 7 ข้อ\nเพื่อคำนวณเป้าหมายแคลอรี่ส่วนตัวของคุณนะ\n\n📌 ข้อที่ 1 : เป้าหมายของคุณคืออะไร?',
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
  } // used in onboard

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
              text: '📌 ข้อที่ 2 : เพศของคุณ?',
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
          '📌 ข้อที่ 3 : คุณอายุเท่าไหร่?\n(พิมพ์ตัวเลข เช่น 22)',
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
              text: '📌 ข้อสุดท้าย : % ไขมันในร่างกาย (ถ้าไม่รู้กด "ข้าม")',
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
  } // used in onboard

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
          '📌 ข้อที่ 4 : น้ำหนักกี่ กก.?\n(พิมพ์ตัวเลข เช่น 65)',
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
          '📌 ข้อที่ 5 : ส่วนสูงกี่ ซม.?\n(พิมพ์ตัวเลข เช่น 170)',
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
              text: '📌 ข้อที่ 6 : ระดับกิจกรรมในชีวิตประจำวัน?',
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
        return this.replyText(replyToken, '⚠️ กรุณากดปุ่มเพื่อเลือก');
    }
  } // used in onboard

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

    await this.replyOnboardingComplete(
      replyToken,
      goalLabel[data.goal],
      profile,
    );
  } // used in onboard

  private async replyOnboardingComplete(
    replyToken: string,
    goalLabel: string,
    profile: {
      dailyCalorieGoal: number;
      dailyProteinGoal: number;
      dailyCarbGoal: number;
      dailyFatGoal: number;
    },
  ): Promise<void> {
    // TODO: เปลี่ยน LIFF_DASHBOARD_URL เป็น URL จริงเมื่อ LIFF Dashboard พร้อม (ตอนนี้แค่ประวัติ ยังไม่มีหน้าตั้งค่าโปรไฟล์)
    const LIFF_DASHBOARD_URL = 'https://liff.line.me/placeholder';

    await this.client.replyMessage({
      replyToken,
      messages: [
        {
          type: 'flex',
          altText: '✅ ตั้งค่าโปรไฟล์เสร็จแล้ว!',
          contents: {
            type: 'bubble',
            styles: { body: { backgroundColor: '#FFF8F0' } },
            body: {
              type: 'box',
              layout: 'vertical',
              spacing: 'md',
              contents: [
                {
                  type: 'text',
                  text: '✅ ตั้งค่าเสร็จแล้ว!',
                  weight: 'bold',
                  size: 'xl',
                  color: '#1DB446',
                },
                {
                  type: 'text',
                  text: 'เป้าหมายของคุณ',
                  size: 'sm',
                  color: '#999999',
                  margin: 'md',
                },
                {
                  type: 'box',
                  layout: 'vertical',
                  spacing: 'sm',
                  margin: 'sm',
                  contents: [
                    {
                      type: 'box',
                      layout: 'baseline',
                      contents: [
                        {
                          type: 'text',
                          text: '🎯 เป้าหมาย',
                          flex: 3,
                          size: 'sm',
                          color: '#555555',
                        },
                        {
                          type: 'text',
                          text: goalLabel,
                          flex: 4,
                          size: 'sm',
                          weight: 'bold',
                          color: '#333333',
                        },
                      ],
                    },
                    {
                      type: 'box',
                      layout: 'baseline',
                      contents: [
                        {
                          type: 'text',
                          text: '🔥 แคลอรี่',
                          flex: 3,
                          size: 'sm',
                          color: '#555555',
                        },
                        {
                          type: 'text',
                          text: `${profile.dailyCalorieGoal} kcal/วัน`,
                          flex: 4,
                          size: 'sm',
                          weight: 'bold',
                          color: '#D97A2B',
                        },
                      ],
                    },
                    {
                      type: 'box',
                      layout: 'baseline',
                      contents: [
                        {
                          type: 'text',
                          text: '🥩 โปรตีน',
                          flex: 3,
                          size: 'sm',
                          color: '#555555',
                        },
                        {
                          type: 'text',
                          text: `${profile.dailyProteinGoal}g`,
                          flex: 4,
                          size: 'sm',
                          color: '#333333',
                        },
                      ],
                    },
                    {
                      type: 'box',
                      layout: 'baseline',
                      contents: [
                        {
                          type: 'text',
                          text: '🍚 คาร์บ',
                          flex: 3,
                          size: 'sm',
                          color: '#555555',
                        },
                        {
                          type: 'text',
                          text: `${profile.dailyCarbGoal}g`,
                          flex: 4,
                          size: 'sm',
                          color: '#333333',
                        },
                      ],
                    },
                    {
                      type: 'box',
                      layout: 'baseline',
                      contents: [
                        {
                          type: 'text',
                          text: '🥑 ไขมัน',
                          flex: 3,
                          size: 'sm',
                          color: '#555555',
                        },
                        {
                          type: 'text',
                          text: `${profile.dailyFatGoal}g`,
                          flex: 4,
                          size: 'sm',
                          color: '#333333',
                        },
                      ],
                    },
                  ],
                },
                { type: 'separator', margin: 'lg' },
                {
                  type: 'text',
                  text: 'มีอะไรให้ลองเลย 👇',
                  size: 'sm',
                  color: '#999999',
                  margin: 'lg',
                },
                {
                  type: 'box',
                  layout: 'vertical',
                  spacing: 'sm',
                  margin: 'sm',
                  contents: [
                    {
                      type: 'text',
                      text: '📸 ถ่ายรูปอาหาร → บันทึกอัตโนมัติ',
                      size: 'sm',
                      color: '#555555',
                    },
                    {
                      type: 'text',
                      text: '💬 พิมพ์คุยกับเรา เช่น "วันนี้กินอะไรดี"',
                      size: 'sm',
                      color: '#555555',
                    },
                    {
                      type: 'text',
                      text: '🗺️ ถามหาร้านอาหารใกล้ๆ',
                      size: 'sm',
                      color: '#555555',
                    },
                  ],
                },
              ],
            },
            footer: {
              type: 'box',
              layout: 'vertical',
              backgroundColor: '#FFF8F0',
              contents: [
                {
                  type: 'button',
                  style: 'primary',
                  color: '#D97A2B',
                  action: {
                    type: 'uri',
                    label: '📊 เปิด Dashboard',
                    uri: LIFF_DASHBOARD_URL,
                  },
                },
              ],
            },
          },
        },
      ],
    });
  } // used in onboard

  // ─── Image flow ──────────────────────────────────────────────

  private async replyFoodSavedCard(
    replyToken: string,
    userId: string,
    result: Awaited<ReturnType<typeof this.geminiService.analyzeFood>>,
    savedEntryId: string,
  ): Promise<void> {
    const todayEntries = await this.foodDiaryService.getTodaySummary(userId);
    const totalCalories = todayEntries.reduce((sum, e) => sum + e.calories, 0);
    const totalProtein = todayEntries.reduce((sum, e) => sum + e.protein, 0);

    await this.client.replyMessage({
      replyToken,
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
                  text: '✅ บันทึกอาหารแล้ว!',
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
                { type: 'separator', margin: 'lg' },
                {
                  type: 'box',
                  layout: 'vertical',
                  margin: 'lg',
                  contents: [
                    {
                      type: 'text',
                      text: 'โภชนาการ :',
                      size: 'sm',
                      color: '#999999',
                    },
                    {
                      type: 'text',
                      text: `🔥 ${result.calories} kcal  🥩 โปรตีน ${result.protein}g`,
                      size: 'sm',
                      color: '#555555',
                      margin: 'sm',
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
                { type: 'separator', margin: 'lg' },
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
  } // used in image flow

  private async saveFoodDiaryEntry(
    userId: string,
    result: Awaited<ReturnType<typeof this.geminiService.analyzeFood>>,
  ): Promise<string> {
    if (!result.menuName || result.calories <= 0) return '';
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
    return String(saved._id);
  } // used in image flow

  private async fetchImageAsBase64(messageId: string): Promise<string> {
    const stream = await this.blobClient.getMessageContent(messageId);
    const buf = await buffer(stream);
    return buf.toString('base64');
  } // used in image flow

  private async animationLoading(userId: string, loadingSec: number) {
    await this.client.showLoadingAnimation({
      chatId: userId,
      loadingSeconds: loadingSec,
    });
  } // used

  private async replyText(replyToken: string, text: string): Promise<void> {
    await this.client.replyMessage({
      replyToken: replyToken,
      messages: [{ type: 'text', text }],
    });
  }

  // ─── AI Agent ──────────────────────────────────────────────

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
        session.agentHistory,
      );
      session.agentHistory = agentResponse.updatedHistory;
    } catch (err) {
      console.error('[handleAgentChat] error:', err);
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
    const priceLevelText = this.getPlacePriceLevelText(restaurant.priceLevel);
    const openText =
      restaurant.isOpenNow === true
        ? '🟢 เปิดอยู่'
        : restaurant.isOpenNow === false
          ? '🔴 ปิดแล้ว'
          : '-';

    const PLACEHOLDER_IMAGE =
      'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&q=80';

    return {
      type: 'bubble' as const,
      styles: { body: { backgroundColor: '#FFF8F0' } },
      hero: {
        type: 'image',
        url: restaurant.photoUrl ?? PLACEHOLDER_IMAGE,
        size: 'full',
        aspectRatio: '20:13',
        aspectMode: 'cover',
      },
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

  // Haversine formula
  calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371e3; // รัศมีโลก (เมตร)
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // ระยะทาง (เมตร)
  }
}
