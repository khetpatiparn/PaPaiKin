import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const VALID_INGREDIENTS = [
  'หมู',
  'หมูสับ',
  'หมูกรอบ',
  'หมูแดง',
  'เนื้อหมู',
  'ขาหมู',
  'หมูสามชั้น',
  'ตับ',
  'ไส้กรอก',
  'ไก่',
  'อกไก่',
  'สะโพกไก่',
  'ปีกไก่',
  'ไก่ต้ม',
  'เนื้อ',
  'เนื้อวัว',
  'กุ้ง',
  'ปลา',
  'ปลาหมึก',
  'หอย',
  'ปู',
  'ผัก',
  'เต้าหู้',
  'เห็ด',
];

const VALID_COOKING_METHODS = [
  'แห้ง',
  'ผัด',
  'ทอด',
  'ย่าง',
  'ยำ',
  'น้ำ',
  'แกง',
  'ต้ม',
  'ซุป',
  'ตุ๋น',
  'ราด',
];

const VALID_CATEGORIES = [
  'SINGLE_DISH',
  'NOODLE',
  'SNACK',
  'SALAD',
  'SOUP',
  'STEAK',
  'JAPANESE',
  'KOREAN',
];

interface MenuClassification {
  menuName: string;
  ingredients: string[];
  cookingMethod: string[];
  category: string;
}

async function classifyBatch(
  menuNames: string[],
): Promise<MenuClassification[]> {
  const prompt = `จงจำแนกเมนูอาหารไทยต่อไปนี้ ตอบเป็น JSON array เท่านั้น ห้ามมีข้อความอื่น

เมนู:
${menuNames.map((n, i) => `${i + 1}. ${n}`).join('\n')}

สำหรับแต่ละเมนู ให้ตอบ:
- "menuName": ชื่อเมนูเดิม (ห้ามเปลี่ยน)
- "ingredients": array ของวัตถุดิบเนื้อสัตว์/โปรตีนหลัก เลือกได้เฉพาะจากรายการนี้เท่านั้น: ${JSON.stringify(VALID_INGREDIENTS)}
  กฎสำคัญ:
  * ถ้าเมนูระบุเนื้อสัตว์ชัดเจน (เช่น "ข้าวกระเพราหมูสับ") → ใส่เฉพาะที่ระบุ: ["หมูสับ"]
  * ถ้าเมนูสั่งได้หลายเนื้อ (เช่น "ข้าวกระเพรา" "ข้าวผัด" "ผัดกะเพรา") → ใส่ทุกเนื้อที่เป็นไปได้: ["หมู","หมูสับ","ไก่","อกไก่","เนื้อ","กุ้ง","ปลา","ปลาหมึก"]
  * ถ้าเป็นเมนูผัก/เต้าหู้ล้วน → ใส่ ["ผัก"] หรือ ["เต้าหู้"]
  * ถ้าเป็นเครื่องดื่ม ขนม ผลไม้ → ใส่ []
- "cookingMethod": array ของวิธีปรุง เลือกได้เฉพาะจากรายการนี้เท่านั้น: ${JSON.stringify(VALID_COOKING_METHODS)}
  * ถ้าเมนูมีน้ำ/ซุป/แกง → ใส่ค่าจากกลุ่ม น้ำ
  * ถ้าเมนูแห้ง/ผัด/ทอด → ใส่ค่าจากกลุ่ม แห้ง
  * ถ้าไม่แน่ใจ → ใส่ []
- "category": หมวดหมู่ เลือก 1 จาก: ${JSON.stringify(VALID_CATEGORIES)}
  * SINGLE_DISH = ข้าวราดแกง ข้าวผัด ข้าวกระเพรา ข้าวหน้า โจ๊ก อาหารจานเดียว
  * NOODLE = ก๋วยเตี๋ยว บะหมี่ เส้นใหญ่ เส้นเล็ก สปาเก็ตตี้ มาม่า ราเมน
  * DRINK = เครื่องดื่ม น้ำผลไม้ กาแฟ ชา นม ชานม
  * DESSERT = ขนมหวาน ไอศกรีม วาฟเฟิล
  * SNACK = ของทานเล่น ขนมปัง ปังเย็น ไส้กรอกทอด ลูกชิ้นทอด
  * SALAD = ยำ ส้มตำ ตำ ลาบ น้ำตก สลัด
  * SOUP = ต้มยำ ต้มข่า แกงจืด ซุป (เป็นชาม ไม่ใช่ราดข้าว)
  * STEAK = สเต็ก
  * JAPANESE = ซูชิ ราเมน คัตสึ ข้าวหน้าญี่ปุ่น ดงบุริ
  * KOREAN = อาหารเกาหลี บิงซู ต็อบกี

ตัวอย่าง output:
[
  {"menuName":"ข้าวกระเพรา","ingredients":["หมู","หมูสับ","ไก่","อกไก่","เนื้อ","กุ้ง","ปลา"],"cookingMethod":["ผัด"],"category":"SINGLE_DISH"},
  {"menuName":"ข้าวกระเพราหมูสับ","ingredients":["หมูสับ"],"cookingMethod":["ผัด"],"category":"SINGLE_DISH"},
  {"menuName":"ก๋วยเตี๋ยวต้มยำ","ingredients":["หมู","ไก่","กุ้ง","ปลาหมึก"],"cookingMethod":["ต้ม","น้ำ"],"category":"NOODLE"},
  {"menuName":"สเต็กหมู","ingredients":["หมู"],"cookingMethod":["ย่าง"],"category":"STEAK"}
]`;

  const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });
      const text = response.text ?? '[]';
      return JSON.parse(text) as MenuClassification[];
    } catch (error: any) {
      if (error?.status === 429) {
        console.warn(`${model} quota exceeded, trying next...`);
        continue;
      }
      throw error;
    }
  }
  throw new Error('All models failed');
}

function escapeCSV(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

async function main() {
  const csvPath = path.join(
    __dirname,
    '..',
    '..',
    'data',
    'Data PaPaiKin - Menu.csv',
  );
  const raw = fs.readFileSync(csvPath, 'utf-8');
  const lines = raw.split('\n').filter((l) => l.trim());
  const header = lines[0];

  // Parse existing data (keep existing category if already filled)
  interface MenuRow {
    menuName: string;
    ingredients: string;
    cookingMethod: string;
    menuImage: string;
    category: string;
  }
  const existingRows: MenuRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    existingRows.push({
      menuName: parts[0]?.trim() ?? '',
      ingredients: parts[1]?.trim() ?? '',
      cookingMethod: parts[2]?.trim() ?? '',
      category: parts[3]?.trim() ?? '',
      menuImage: parts[4]?.trim() ?? '',
    });
  }

  // Only send menus that are missing any of ingredients/cookingMethod/category
  const menuNames = existingRows
    .filter(
      (r) => r.menuName && (!r.ingredients || !r.cookingMethod || !r.category),
    )
    .map((r) => r.menuName);
  console.log(
    `Total menus: ${existingRows.length}, needs fill: ${menuNames.length}`,
  );

  const BATCH_SIZE = 30;
  const allResults: Map<string, MenuClassification> = new Map();

  for (let i = 0; i < menuNames.length; i += BATCH_SIZE) {
    const batch = menuNames.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(menuNames.length / BATCH_SIZE);
    console.log(
      `Processing batch ${batchNum}/${totalBatches} (${batch.length} items)...`,
    );

    try {
      const results = await classifyBatch(batch);
      for (const r of results) {
        // Validate: only keep values from valid lists
        r.ingredients = r.ingredients.filter((ing) =>
          VALID_INGREDIENTS.includes(ing),
        );
        r.cookingMethod = r.cookingMethod.filter((cm) =>
          VALID_COOKING_METHODS.includes(cm),
        );
        if (!VALID_CATEGORIES.includes(r.category)) r.category = '';
        allResults.set(r.menuName, r);
      }
      console.log(`  Got ${results.length} results`);
    } catch (err) {
      console.error(`  Batch ${batchNum} failed:`, err);
    }

    // Rate limit: wait 2s between batches
    if (i + BATCH_SIZE < menuNames.length) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  // Build output lines
  const outputLines = [header];
  for (const row of existingRows) {
    if (!row.menuName) continue;
    const r = allResults.get(row.menuName);
    if (r) {
      // Row already had data — keep existing, only fill missing fields
      outputLines.push(
        [
          escapeCSV(r.menuName),
          escapeCSV(row.ingredients || r.ingredients.join('|')),
          escapeCSV(row.cookingMethod || r.cookingMethod.join('|')),
          row.category || r.category,
          row.menuImage, // keep existing Cloudinary URL
        ].join(','),
      );
    } else {
      // No Gemini result (row already had all data) — keep original line
      outputLines.push(lines[existingRows.indexOf(row) + 1]);
    }
  }

  // Write to new file (safe — doesn't overwrite original)
  const outputPath = csvPath.replace('.csv', ' - filled.csv');
  fs.writeFileSync(outputPath, outputLines.join('\n'), 'utf-8');
  console.log(`\nDone! Written to: ${path.basename(outputPath)}`);
  console.log(`Classified: ${allResults.size}/${menuNames.length} menus`);

  // Stats
  let withIngredients = 0,
    withCooking = 0,
    withCategory = 0;
  for (const r of allResults.values()) {
    if (r.ingredients.length > 0) withIngredients++;
    if (r.cookingMethod.length > 0) withCooking++;
    if (r.category) withCategory++;
  }
  console.log(`  With ingredients: ${withIngredients}`);
  console.log(`  With cookingMethod: ${withCooking}`);
  console.log(`  With category: ${withCategory}`);
}

main().catch(console.error);
