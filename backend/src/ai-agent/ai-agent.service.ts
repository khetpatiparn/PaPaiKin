import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI, Type, type Content } from '@google/genai';
import { NutritionService } from 'src/nutrition/nutrition.service';
import {
  GooglePlacesService,
  PlaceResult,
} from 'src/google-places/google-places.service';

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
    'gemini-1.5-flash',
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

  constructor(
    private readonly nutritionService: NutritionService,
    private readonly googlePlacesService: GooglePlacesService,
  ) {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  async chat(
    lineUserId: string,
    userMessage: string,
    location?: { lat: number; lng: number },
    history?: Content[],
  ): Promise<AgentResponse> {
    // 1. เตรียมข้อมูล nutrition ก่อนส่งให้ Gemini
    const [gap, weekly] = await Promise.all([
      this.nutritionService.getNutritionGap(lineUserId),
      this.nutritionService.getWeeklySummary(lineUserId),
    ]);

    const nutritionContext = gap.hasProfile
      ? `ข้อมูลโภชนาการวันนี้ของ user:
- แคลอรี่: กินไป ${gap.calories.consumed} kcal / เป้า ${gap.calories.goal} kcal (ขาดอีก ${gap.calories.remaining} kcal)
- โปรตีน: กินไป ${gap.protein.consumed}g / เป้า ${gap.protein.goal}g (ขาดอีก ${gap.protein.remaining}g)
- คาร์บ: กินไป ${gap.carb.consumed}g / เป้า ${gap.carb.goal}g (ขาดอีก ${gap.carb.remaining}g)
- ไขมัน: กินไป ${gap.fat.consumed}g / เป้า ${gap.fat.goal}g (ขาดอีก ${gap.fat.remaining}g)

ค่าเฉลี่ยสัปดาห์นี้: ${weekly.avgCalories} kcal/วัน, โปรตีน ${weekly.avgProtein}g/วัน`
      : 'user ยังไม่มีข้อมูลโภชนาการ';

    const locationContext = location
      ? `ตำแหน่ง user: lat=${location.lat}, lng=${location.lng}`
      : 'user ไม่ได้แชร์ตำแหน่ง (ห้ามเรียก findNearbyRestaurants)';

    const systemPrompt = `คุณคือผู้ช่วยโภชนาการส่วนตัว ตอบเป็นภาษาไทย เป็นกันเอง กระชับ ไม่ต้องพูดชื่อตัวเองในทุกประโยค

${nutritionContext}
${locationContext}

กฎการตอบ:
- ถ้า user ทักทายหรือพูดเล่นๆ → ทักกลับ 1 ประโยค แล้วแสดงรายการตัวอย่างที่ช่วยได้ในรูปแบบนี้เสมอ:\n"อยากให้เราช่วยเรื่องอะไรบอกมาได้เลย เช่น\n🍱 สรุปมื้อวันนี้ให้หน่อย\n🗺️ ช่วยหาร้านอาหาร\n📊 เราขาดสารอาหารอะไร\n🤔 กินอะไรดี\n🥗 แนะนำมื้อให้หน่อย\n💬 อื่นๆ"
- ถ้า user ถามเรื่องอาหารหรือโภชนาการ → แสดงผลเป็นลิสต์ดูง่าย ต้องใส่ตัวเลขจริงเสมอ รูปแบบ:\n"วันนี้กินไปแล้ว:\n🔥 แคลอรี่: X/Y kcal (ขาดอีก Z kcal)\n🥩 โปรตีน: X/Y g (ขาดอีก Z g)\n🍚 คาร์บ: X/Y g (ขาดอีก Z g)\n🥑 ไขมัน: X/Y g (ขาดอีก Z g)"\nถ้ามีข้อมูลเมนูที่ user กินในวันนี้ → บอกด้วยสั้นๆ เช่น "มื้อที่บันทึก: ข้าวผัด, ไข่ต้ม" แต่ถ้าไม่มีก็ไม่ต้องบอก
- ใช้บรรทัดใหม่ (\n\n) แบ่งย่อหน้า ไม่เขียนต่อกันยาว
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

    const contents: Content[] = [
      ...(history ?? []).slice(-12),
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
            tools: [this.findNearbyRestaurantsTool],
          },
        });

        // 2. Agentic loop — วนจนกว่า Gemini หยุดเรียก function
        while (response.functionCalls && response.functionCalls.length > 0) {
          const functionCall = response.functionCalls[0];
          this.logger.log(
            `Gemini calls: ${functionCall.name} args=${JSON.stringify(functionCall.args)}`,
          );

          let functionResult: PlaceResult[] = [];
          if (functionCall.name === 'findNearbyRestaurants' && location) {
            const args = functionCall.args as {
              keyword?: string;
              radiusMeters?: number;
              minRating?: number;
              openNow?: boolean;
              maxPrice?: number;
            };
            functionResult =
              await this.googlePlacesService.findNearbyRestaurants(
                location.lat,
                location.lng,
                args.keyword,
                args.radiusMeters,
                args.minRating,
                args.openNow,
                args.maxPrice,
              );
          }

          // ส่งผลกลับ Gemini
          contents.push(response.candidates![0].content as Content);
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
              tools: [this.findNearbyRestaurantsTool],
            },
          });
        }

        // 3. parse JSON สุดท้าย (strip markdown code block ถ้ามี)
        const rawText = (response.text ?? '{}')
          .trim()
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();

        let raw: {
          summary?: string;
          needsLocation?: boolean;
          restaurants?: { name?: string; reason?: string }[];
        };
        try {
          raw = JSON.parse(rawText);
        } catch {
          // Gemini ตอบ plain text ไม่ใช่ JSON → ใช้เป็น summary โดยตรง
          raw = { summary: rawText, needsLocation: false, restaurants: [] };
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

        // เก็บ turn ปัจจุบันเข้า history (model response ล่าสุด)
        if (response.candidates?.[0]?.content) {
          contents.push(response.candidates[0].content as Content);
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
        if (error?.status === 429) {
          this.logger.warn(`${model} quota exceeded, trying next...`);
          continue;
        }
        throw error;
      }
    }

    return { summary: 'ขออภัย ระบบไม่พร้อมใช้งานในขณะนี้', needsLocation: false, updatedHistory: [], restaurants: [] };
  }
}
