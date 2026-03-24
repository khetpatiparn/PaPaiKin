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

  async analyzeFood(image: string): Promise<string> {
    const prompt = `วิเคราะห์รูปภาพอาหารนี้และบอกข้อมูลโภชนาการเป็นภาษาไทย 

    รูปแบบที่ต้องการ:
    📸 เมนูที่พบในภาพ:
    🍽️ [ชื่อเมนูที่ 1]
    🍽️ [ชื่อเมนูที่ 2]
    🍽️ [ชื่อเมนูที่ 3]

    🔥 แคลอรี่รวมประมาณ: [ตัวเลข] kcal

    📊 สารอาหารหลักโดยประมาณ:
    🍚 คาร์บ: [ตัวเลข] g
    🥩 โปรตีน: [ตัวเลข] g
    🥑 ไขมัน: [ตัวเลข] g

    ข้อกำหนดสำคัญ: 
    - ตอบกระชับตามรูปแบบที่กำหนด
    - ห้ามใช้เครื่องหมาย ** หรือ Markdown จัดรูปแบบตัวอักษรโดยเด็ดขาด
    - ในส่วน "เมนูที่พบในภาพ" ให้ขึ้นบรรทัดใหม่และใช้เครื่องหมาย 🍽️ นำหน้าแต่ละเมนูเสมอ ห้ามใช้เครื่องหมายจุลภาค (,) คั่นเด็ดขาด`;
    for (const model of this.models) {
      try {
        this.logger.log(`trying model: ${model}`);
        const response = await this.ai.models.generateContent({
          model,
          contents: [
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: image,
              },
            },
            {
              text: prompt,
            },
          ],
        });
        return response.text ?? 'ไม่สามารถวิเคราะห์อาหารได้';
      } catch (error: any) {
        if (error?.status === 429) {
          this.logger.warn(`${model} quota exceeded, trying next model...`);
          continue;
        }
        throw error;
      }
    }
    return 'ขออภัย ระบบวิเคราะห์อาหารไม่พร้อมใช้งาน';
  }
}
