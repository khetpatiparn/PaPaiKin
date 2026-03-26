import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';

@Injectable()
export class GeminiService {
  private ai: GoogleGenAI;
  private readonly logger = new Logger(GeminiService.name);

  private readonly models = [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-3-flash-preview',
  ];

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  async generateRecipe(context: string): Promise<string> {
    const prompt = `สร้างสูตรอาหารสำหรับเมนูต่อไปนี้เป็นภาษาไทย โดยใช้ข้อมูลที่มีให้ประกอบ:
    ${context}
    รูปแบบที่ต้องการ:
    🧂 ส่วนผสม:
    - [รายการ]

    👨‍🍳 วิธีทำ:
    1. [ขั้นตอน]

    ข้อกำหนดสำคัญ: 
    - ตอบกระชับ ไม่เกิน 300 คำ
    - ห้ามใช้เครื่องหมาย ** หรือ Markdown จัดรูปแบบตัวอักษรโดยเด็ดขาด ให้ตอบเป็นข้อความธรรมดา (Plain text) เท่านั้น`;

    for (const model of this.models) {
      try {
        this.logger.log(`trying model: ${model}`);
        const response = await this.ai.models.generateContent({
          model,
          contents: prompt,
        });
        return response.text ?? 'ขออภัย ไม่สามารถสร้างสูตรอาหารได้ในขณะนี้';
      } catch (error: any) {
        if (error?.status === 429) {
          this.logger.warn(`${model} quota exceeded, trying next model...`);
          continue;
        }
        throw error;
      }
    }
    return 'ขออภัย ระบบดูสูตร ไม่พร้อมใช้งานในขณะนี้กรุณาลองใหม่ภายหลัง';
  }

  async analyzeFood(image: string): Promise<{
    displayText: string;
    menuName: string;
    calories: number;
    nutrients: string;
  }> {
    const prompt = `วิเคราะห์รูปภาพอาหารนี้และบอกข้อมูลโภชนาการเป็นภาษาไทย ตอบเป็น JSON เท่านั้น

    รูปแบบ JSON:
    {
      "menuName": "ชื่อเมนูทั้งหมดที่พบ คั่นด้วย , ",
      "calories": ตัวเลขแคลอรี่รวม,
      "carbs": ตัวเลขคาร์บ (กรัม),
      "protein": ตัวเลขโปรตีน (กรัม),
      "fat": ตัวเลขไขมัน (กรัม)
    }`;

    for (const model of this.models) {
      try {
        this.logger.log(`trying model: ${model}`);
        const response = await this.ai.models.generateContent({
          model,
          contents: [
            { inlineData: { mimeType: 'image/jpeg', data: image } },
            { text: prompt },
          ],
          config: { responseMimeType: 'application/json' },
        });

        const json = JSON.parse(response.text ?? '{}');
        const nutrients = `🍚 คาร์บ: ${json.carbs ?? 0}g  🥩 โปรตีน: ${json.protein ?? 0}g  🥑 ไขมัน: ${json.fat ?? 0}g`;
        const displayText = `📸 เมนูที่พบ: ${json.menuName}\n🔥 แคลอรี่รวม: ${json.calories ?? 0} kcal\n\n📊 สารอาหาร:\n${nutrients}`;

        return {
          displayText,
          menuName: json.menuName ?? '',
          calories: json.calories ?? 0,
          nutrients,
        };
      } catch (error: any) {
        if (error?.status === 429) {
          this.logger.warn(`${model} quota exceeded, trying next model...`);
          continue;
        }
        throw error;
      }
    }
    return {
      displayText: 'ขออภัย ระบบวิเคราะห์อาหารไม่พร้อมใช้งาน',
      menuName: '',
      calories: 0,
      nutrients: '',
    };
  }
}
