import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI, Type, type Content } from '@google/genai';
import { NutritionService } from 'src/nutrition/nutrition.service';
import {
  GooglePlacesService,
  PlaceResult,
} from 'src/google-places/google-places.service';
import { FoodDiaryService } from 'src/food-diary/food-diary.service';
import { UserProfileService } from 'src/user-profile/user-profile.service';

export interface AgentResponse {
  summary: string;
  needsLocation: boolean;
  updatedHistory: Content[];
  restaurants: {
    name: string;
    vicinity: string;
    rating: number;
    priceLevel: number;
    isOpenNow: boolean | null;
    lat: number;
    lng: number;
    reason: string;
    photoUrl: string | null;
  }[];
}

@Injectable()
export class AiAgentService {
  private readonly logger = new Logger(AiAgentService.name);
  private readonly ai: GoogleGenAI;
  private readonly models = [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
    'gemini-1.5-flash-latest',
  ];

  private readonly findNearbyRestaurantsTool = {
    functionDeclarations: [
      {
        name: 'findNearbyRestaurants',
        description:
          'ค้นหาร้านอาหารใกล้ผู้ใช้ สามารถกรองตาม keyword, รัศมี, rating ขั้นต่ำ, เฉพาะที่เปิดอยู่, และราคาสูงสุด',
        parameters: {
          type: Type.OBJECT,
          properties: {
            keyword: {
              type: Type.STRING,
              description:
                'ประเภทอาหารหรือชื่อเมนูที่ต้องการ เช่น ก๋วยเตี๋ยว, อกไก่, ข้าวมันไก่',
            },
            radiusMeters: {
              type: Type.NUMBER,
              description: 'รัศมีการค้นหา (เมตร) default=1000',
            },
            minRating: {
              type: Type.NUMBER,
              description: 'rating ขั้นต่ำ 0-5 เช่น 4.0 = รีวิวดีขึ้นไป',
            },
            openNow: {
              type: Type.BOOLEAN,
              description: 'true = เฉพาะร้านที่เปิดอยู่ตอนนี้',
            },
            maxPrice: {
              type: Type.NUMBER,
              description:
                'ราคาสูงสุด 0-4 (0=ฟรี 1=ถูก 2=ปานกลาง 3=แพง 4=แพงมาก)',
            },
          },
          required: [],
        },
      },
    ],
  };

  private readonly logFoodEntryTool = {
    functionDeclarations: [
      {
        name: 'logFoodEntry',
        description:
          'ใช้บันทึกข้อมูลโภชนาการลงในระบบเมื่อผู้ใช้พิมพ์บอกชื่ออาหารหรือสิ่งที่เพิ่งกินไป โดยให้ AI ประเมินปริมาณสารอาหารเองแล้วส่งมาให้ระบบ',
        parameters: {
          type: Type.OBJECT,
          properties: {
            menuName: {
              type: Type.STRING,
              description: 'ชื่อเมนูอาหาร เช่น ข้าวมันไก่, นมสด, หมูปิ้ง',
            },
            estimatedCalories: {
              type: Type.NUMBER,
              description: 'แคลอรี่ที่ประเมินได้',
            },
            protein: {
              type: Type.NUMBER,
              description: 'โปรตีนที่ประเมินได้ (กรัม)',
            },
            carb: {
              type: Type.NUMBER,
              description: 'คาร์โบไฮเดรตที่ประเมินได้ (กรัม)',
            },
            fat: {
              type: Type.NUMBER,
              description: 'ไขมันที่ประเมินได้ (กรัม)',
            },
            mealType: {
              type: Type.STRING,
              description:
                'มื้ออาหารที่สกัดจากประโยคผู้ใช้ (breakfast, lunch, dinner, snack) ถ้าไม่ระบุเวลาที่ชัดเจนไม่ต้องส่งฟิลด์นี้มา',
            },
            cuisineType: {
              type: Type.STRING,
              description:
                'สัญชาติอาหารหรือประเภทหมวดหมู่ (เช่น อาหารไทย, ของหวาน, เครื่องดื่ม, อาหารญี่ปุ่น)',
            },
          },
          required: ['menuName', 'estimatedCalories', 'protein', 'carb', 'fat'],
        },
      },
    ],
  };

  constructor(
    private readonly nutritionService: NutritionService,
    private readonly googlePlacesService: GooglePlacesService,
    private readonly foodDiaryService: FoodDiaryService,
    private readonly userProfileService: UserProfileService,
  ) {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  async chat(
    lineUserId: string,
    userMessage: string,
    location?: { lat: number; lng: number },
    history?: Content[],
  ): Promise<AgentResponse> {
    const [gap, weekly, todayEntries, userProfile] = await Promise.all([
      this.nutritionService.getNutritionGap(lineUserId),
      this.nutritionService.getWeeklySummary(lineUserId),
      this.foodDiaryService.getTodaySummary(lineUserId),
      this.userProfileService.findByLineUserId(lineUserId),
    ]);

    const menusText =
      todayEntries.length > 0
        ? `\nมื้อที่บันทึกวันนี้: ${todayEntries.map((e) => `${e.menuName} (${e.calories} kcal)`).join(', ')}`
        : '\nมื้อที่บันทึกวันนี้: ยังไม่มีการบันทึกอาหาร';

    const profileText = userProfile
      ? `เพศ: ${userProfile.gender === 'male' ? 'ชาย' : 'หญิง'}, อายุ: ${userProfile.age} ปี, น้ำหนัก: ${userProfile.weight} kg, ส่วนสูง: ${userProfile.height} cm, เป้าหมาย: ${userProfile.goal === 'lose' ? 'ลดน้ำหนัก' : userProfile.goal === 'gain' ? 'เพิ่มน้ำหนัก' : 'รักษาน้ำหนัก'}`
      : 'ไม่มีข้อมูลส่วนสูง/น้ำหนักประจำตัว';

    const nutritionContext = gap.hasProfile
      ? `ข้อมูลโภชนาการและสถานะปัจจุบันของ user:
- ข้อมูลทางกายภาพ: ${profileText}
- แคลอรี่: กินไป ${gap.calories.consumed} kcal / เป้า ${gap.calories.goal} kcal (ขาดอีก ${gap.calories.remaining} kcal)
- โปรตีน: กินไป ${gap.protein.consumed}g / เป้า ${gap.protein.goal}g (ขาดอีก ${gap.protein.remaining}g)
- คาร์บ: กินไป ${gap.carb.consumed}g / เป้า ${gap.carb.goal}g (ขาดอีก ${gap.carb.remaining}g)
- ไขมัน: กินไป ${gap.fat.consumed}g / เป้า ${gap.fat.goal}g (ขาดอีก ${gap.fat.remaining}g)
${menusText}

ค่าเฉลี่ยสัปดาห์นี้: ${weekly.avgCalories} kcal/วัน, โปรตีน ${weekly.avgProtein}g/วัน`
      : 'user ยังไม่มีข้อมูลโภชนาการ (แนะนำให้ไปตั้งค่า profile)';

    const locationContext = location
      ? `ตำแหน่ง user: lat=${location.lat}, lng=${location.lng}`
      : 'user ไม่ได้แชร์ตำแหน่ง (ห้ามเรียก findNearbyRestaurants)';

    const systemPrompt = `คุณคือผู้ช่วยโภชนาการส่วนตัว ตอบเป็นภาษาไทย เป็นกันเอง กระชับ ไม่ต้องพูดชื่อตัวเองในทุกประโยค

${nutritionContext}
${locationContext}

กฎการตอบ:
- สำคัญมาก: หาก user เล่าว่าเพิ่งกินอะไรไป ให้เรียกฟังก์ชัน logFoodEntry ทันทีเพื่อบันทึกลงระบบ
- หาก user แจ้งว่า "น้ำหนักปัจจุบันเปลี่ยนไปแล้วจริงๆ" (เช่น ตอนนี้ชั่งได้ 60 แล้ว) ให้บอกให้ user "ไปกดอัปเดตน้ำหนักใหม่ในหน้า Dashboard ด้วย" แต่ถ้า user แค่ถามสมมติหรือปรึกษา (เช่น จะลดเหลือ 60 ได้ไหม, อ้วนไปไหม) ให้ตอบคำนวณให้ตามปกติ และ "ห้าม" สั่งให้อัปเดต Dashboard เด็ดขาด
- ถ้า user พิมพ์มาแค่คำทักทายสั้นๆ โดยไม่มีคำถามอื่น (เช่น สวัสดี, หวัดดี) ให้ทักกลับ 1 ประโยค แล้วแสดงเมนูนี้: "อยากให้เราช่วยเรื่องอะไรบอกมาได้เลย เช่น 🍱 สรุปมื้อ 🗺️ หาร้านอาหาร 📊 สรุปสารอาหาร 🤔 แนะนำมื้อเย็น"
- ถ้า user มีคำถามประโยคยาวๆ หรือ task ชัดเจน (เช่น ควรกินอะไรดี, อ้วนรึยัง) ให้ตอบไปตรงๆ ห้ามพิมพ์อธิบายความสามารถ (Feature guide) ออกมาเด็ดขาด
- คำถามนอกเรื่อง (Jailbreak/ตลก/โค้ดโปรแกรม/แต่งกลอน/แปลภาษา) ให้ปฏิเสธอย่างสุภาพและวกกลับมานำเสนอเรื่องการแนะนำอาหาร
- ให้แสดงตารางสรุปโภชนาการ (🔥 แคลอรี่... 🥩 โปรตีน...) ก็ต่อเมื่อ user "ร้องขอให้สรุปข้อมูล" หรือ "ขอดูสถานะโภชนาการโดยรวม" เท่านั้น
- ถ้า user ถามหาร้านและมีตำแหน่ง → เรียก findNearbyRestaurants เลือก keyword ตาม macro ที่ขาดมากที่สุด

ตอบกลับเป็น JSON รูปแบบนี้เท่านั้น:
{
  "summary": "ข้อความตอบกลับ (ภาษาไทย ใช้ \\n\\n แบ่งย่อหน้า)",
  "needsLocation": false,
  "restaurants": [
    { "name": "ชื่อร้านที่ได้จาก tool", "reason": "บอกว่าร้านนี้เด่นเรื่องอะไร + ตอบโจทย์ macro ที่ขาดอย่างไร เช่น 'เมนูอกไก่ย่างโปรตีนสูง ช่วยเติม 45g ที่ขาดได้มากกว่าครึ่ง'" }
  ]
}
กฎของ needsLocation:
- ถ้า locationContext มีพิกัด (lat=...) → needsLocation ต้องเป็น false เสมอ และเรียก findNearbyRestaurants ได้เลย ห้ามถามตำแหน่งซ้ำ
- true เฉพาะเมื่อ user ถามหาร้านอาหาร/ขอให้แนะนำที่กิน และ locationContext บอกว่าไม่มีตำแหน่ง
- false ทุกกรณีอื่น (ทักทาย ถามโภชนาการ ถามทั่วไป)
ถ้าไม่มีร้านให้แนะนำ ให้ restaurants เป็น []`;

    // ลบ function call/response ออกจาก history เก็บแค่ text
    // ป้องกัน Gemini error "function response turn must come immediately after function call"
    const sanitizedHistory = (history ?? [])
      .map((c) => ({
        role: c.role || 'user',
        parts: (c.parts ?? []).filter(
          (p) => p.text != null && !p.functionCall && !p.functionResponse,
        ),
      }))
      .filter((c) => c.parts.length > 0);

    const contents: Content[] = [
      ...sanitizedHistory.slice(-12),
      {
        role: 'user',
        parts: [{ text: `${systemPrompt}\n\nคำถาม: ${userMessage}` }],
      },
    ];

    for (const model of this.models) {
      try {
        let response = await this.ai.models.generateContent({
          model,
          contents,
          config: {
            tools: [this.findNearbyRestaurantsTool, this.logFoodEntryTool],
          },
        });

        // Agentic loop
        while (response.functionCalls && response.functionCalls.length > 0) {
          const functionCall = response.functionCalls[0];
          this.logger.log(
            `Gemini calls: ${functionCall.name} args=${JSON.stringify(functionCall.args)}`,
          );

          const functionResult = await this.executeToolCall(
            functionCall,
            lineUserId,
            location,
          );

          // ส่งผลกลับ Gemini
          const modelContent = response.candidates?.[0]?.content;
          if (modelContent) {
            contents.push({
              role: modelContent.role || 'model',
              parts: modelContent.parts || [],
            });
          }
          contents.push({
            role: 'user',
            parts: [
              {
                functionResponse: {
                  name: functionCall.name,
                  response: { result: functionResult },
                  id: functionCall.id,
                },
              },
            ],
          });

          response = await this.ai.models.generateContent({
            model,
            contents,
            config: {
              tools: [this.findNearbyRestaurantsTool, this.logFoodEntryTool],
            },
          });
        }

        // parse JSON
        const rawText = (response.text ?? '{}')
          .trim()
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();

        this.logger.log(`Raw Gemini Response: ${rawText}`);

        let raw: {
          summary?: string;
          needsLocation?: boolean;
          restaurants?: { name?: string; reason?: string }[];
        };
        try {
          raw = JSON.parse(rawText);
        } catch {
          raw = { summary: rawText, needsLocation: false, restaurants: [] };
        }

        if (!raw.summary) {
          if (rawText !== '{}' && rawText !== '') {
          } else {
            raw.summary = '(ขอโทษด้วยตอนนี้ฉันกำลังหลับอยู่)';
          }
        }

        // รวม place details จาก function call ล่าสุดกลับเข้า restaurants
        const lastPlaces: PlaceResult[] = contents
          .flatMap((c) => c.parts ?? [])
          .filter((p) => p != null && p.functionResponse != null)
          .flatMap(
            (p) =>
              (
                p.functionResponse as {
                  response: { result: PlaceResult[] };
                }
              ).response.result,
          );

        const placeMap = new Map(lastPlaces.map((p) => [p.name, p]));

        // เก็บ turn ปัจจุบันเข้า history
        const finalContent = response.candidates?.[0]?.content;
        if (
          finalContent &&
          finalContent.parts &&
          finalContent.parts.length > 0
        ) {
          contents.push({
            role: finalContent.role || 'model',
            parts: finalContent.parts,
          });
        }

        return {
          summary: raw.summary ?? '',
          needsLocation: raw.needsLocation ?? false,
          updatedHistory: contents.slice(-12),
          restaurants: (raw.restaurants ?? []).map((r) => {
            const place = placeMap.get(r.name ?? '');
            return {
              name: r.name ?? '',
              vicinity: place?.vicinity ?? '',
              rating: place?.rating ?? 0,
              priceLevel: place?.priceLevel ?? 0,
              isOpenNow: place?.isOpenNow ?? null,
              lat: place?.lat ?? 0,
              lng: place?.lng ?? 0,
              reason: r.reason ?? '',
              photoUrl: place?.photoUrl ?? null,
            };
          }),
        };
      } catch (error: any) {
        if (error?.status === 429 || error?.status === 503) {
          this.logger.warn(
            `${model} quota exceeded or unavailable (503), trying next...`,
          );
          continue;
        }
        if (error?.status === 404) {
          this.logger.warn(`${model} not found, trying next...`);
          continue;
        }
        throw error;
      }
    }

    return {
      summary: 'ขออภัย ระบบไม่พร้อมใช้งานในขณะนี้',
      needsLocation: false,
      updatedHistory: [],
      restaurants: [],
    };
  }

  private async executeToolCall(
    functionCall: { name?: string; args?: any },
    lineUserId: string,
    location?: { lat: number; lng: number },
  ): Promise<any> {
    if (functionCall.name === 'findNearbyRestaurants' && location) {
      const args = functionCall.args as {
        keyword?: string;
        radiusMeters?: number;
        minRating?: number;
        openNow?: boolean;
        maxPrice?: number;
      };
      return await this.googlePlacesService.findNearbyRestaurants(
        location.lat,
        location.lng,
        args.keyword,
        args.radiusMeters,
        args.minRating,
        args.openNow,
        args.maxPrice,
      );
    } else if (functionCall.name === 'logFoodEntry') {
      const args = functionCall.args as {
        menuName: string;
        estimatedCalories: number;
        protein: number;
        carb: number;
        fat: number;
        mealType?: string;
        cuisineType?: string;
      };

      let finalMealType: string | undefined = undefined;
      if (
        args.mealType &&
        ['breakfast', 'lunch', 'dinner', 'snack'].includes(
          args.mealType.toLowerCase(),
        )
      ) {
        finalMealType = args.mealType.toLowerCase();
      }

      const finalCuisineType = args.cuisineType?.trim()
        ? args.cuisineType
        : 'Text Input';

      await this.foodDiaryService.save(
        lineUserId,
        args.menuName,
        args.estimatedCalories,
        args.protein,
        args.carb,
        args.fat,
        finalCuisineType,
        0,
        finalMealType,
      );
      return {
        success: true,
        message: `บันทึกเมนู ${args.menuName} เรียบร้อยแล้ว ประเมินแคลอรี่ที่ ${args.estimatedCalories} kcal`,
      };
    }
    return [];
  }
}
