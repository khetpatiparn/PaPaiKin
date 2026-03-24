import * as fs from 'fs';
import * as path from 'path';
import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.DB_URI!;

const LocationSchema = new mongoose.Schema(
  { type: { type: String, enum: ['Point'], default: 'Point' }, coordinates: [Number] },
  { _id: false },
);
const AttributeSchema = new mongoose.Schema(
  { category: String, ingredients: [String], cookingMethod: [String] },
  { _id: false },
);
const ShopMenuItemSchema = new mongoose.Schema({
  shopId: { type: mongoose.Schema.Types.ObjectId, required: true },
  menuId: { type: mongoose.Schema.Types.ObjectId, required: true },
  shopName: { type: String, required: true },
  menuName: { type: String, required: true },
  price: { type: Number, required: true },
  menuImage: { type: String, default: '' },
  shopImage: { type: String, default: '' },
  shopCategory: { type: String, default: '' },
  locationName: { type: String, default: '' },
  attributes: { type: AttributeSchema },
  location: { type: LocationSchema, required: true },
});
ShopMenuItemSchema.index({ location: '2dsphere' });
const ShopMenuItemModel = mongoose.model('ShopMenuItem', ShopMenuItemSchema);

// ── CSV parser (handles quoted fields with commas) ────────────────────────────
function parseCSV(filePath: string): Record<string, string>[] {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.trim().split('\n');
  const headers = parseLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h.trim()] = (values[idx] ?? '').trim(); });
    rows.push(row);
  }
  return rows;
}

function parseLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { values.push(current); current = ''; }
    else { current += ch; }
  }
  values.push(current);
  return values;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const dataDir = path.join(__dirname, '..', '..', 'data');

  // 1. Menu lookup: menuName → { ingredients, cookingMethod, category, menuImage }
  const menuRows = parseCSV(path.join(dataDir, 'Data PaPaiKin - Menu - filled.csv'));
  const menuMap = new Map<string, Record<string, string>>();
  for (const r of menuRows) menuMap.set(r['menuName'], r);
  console.log(`Menu lookup: ${menuMap.size} entries`);

  // 2. Shop lookup: shopName → { lat, lng, shopImage, locationName, shopCategory }
  const shopRows = parseCSV(path.join(dataDir, 'Data PaPaiKin - Shop.csv'));
  const shopMap = new Map<string, Record<string, string>>();
  for (const r of shopRows) shopMap.set(r['shopName'], r);
  console.log(`Shop lookup: ${shopMap.size} entries`);

  // 3. ShopMenuItems
  const shopMenuRows = parseCSV(path.join(dataDir, 'Data PaPaiKin - ShopMenuItems.csv'));
  console.log(`ShopMenuItems rows: ${shopMenuRows.length}`);

  // 4. Connect MongoDB
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected.');

  const deleted = await ShopMenuItemModel.deleteMany({});
  console.log(`Cleared ${deleted.deletedCount} existing documents`);

  // 5. Generate stable ObjectIds per unique name
  const shopIdMap = new Map<string, mongoose.Types.ObjectId>();
  const menuIdMap = new Map<string, mongoose.Types.ObjectId>();
  for (const row of shopMenuRows) {
    if (!shopIdMap.has(row['shopName'])) shopIdMap.set(row['shopName'], new mongoose.Types.ObjectId());
    if (!menuIdMap.has(row['menuName'])) menuIdMap.set(row['menuName'], new mongoose.Types.ObjectId());
  }

  // 6. Build documents
  const docs: any[] = [];
  let skipped = 0;

  for (const row of shopMenuRows) {
    const shopName = row['shopName'];
    const menuName = row['menuName'];

    // Get coordinates from ShopMenuItems row first, fallback to Shop.csv lookup
    let lat = parseFloat(row['location_lat']);
    let lng = parseFloat(row['location_long']);
    if (isNaN(lat) || isNaN(lng)) {
      const shop = shopMap.get(shopName);
      if (shop) {
        lat = parseFloat(shop['lat']);
        lng = parseFloat(shop['long']);
      }
    }
    if (isNaN(lat) || isNaN(lng)) {
      console.warn(`  Skipping "${menuName}" @ "${shopName}" — no coordinates`);
      skipped++;
      continue;
    }

    // Get menu attributes from filled Menu.csv
    const menu = menuMap.get(menuName);
    const ingredients = menu?.['ingredients']
      ? menu['ingredients'].split('|').map((s: string) => s.trim()).filter(Boolean)
      : [];
    const cookingMethod = menu?.['cookingMethod']
      ? menu['cookingMethod'].split('|').map((s: string) => s.trim()).filter(Boolean)
      : [];
    const category = menu?.['category'] || row['attr_category'] || '';
    const menuImage = menu?.['menuImage'] || row['menuImage'] || '';

    // Get shop info from Shop.csv (more reliable than ShopMenuItems)
    const shop = shopMap.get(shopName);
    const shopImage = shop?.['shopImage'] || row['shopImage'] || '';
    const locationName = shop?.['locationName'] || row['locationName'] || '';
    const shopCategory = shop?.['shopCategory'] || row['shopCategory'] || '';

    docs.push({
      shopId: shopIdMap.get(shopName)!,
      menuId: menuIdMap.get(menuName)!,
      shopName,
      menuName,
      price: parseFloat(row['price']) || 0,
      menuImage,
      shopImage,
      shopCategory,
      locationName,
      attributes: { category, ingredients, cookingMethod },
      location: { type: 'Point', coordinates: [lng, lat] },
    });
  }

  if (skipped > 0) console.warn(`Skipped ${skipped} rows (no coordinates)`);

  const result = await ShopMenuItemModel.insertMany(docs);
  console.log(`Inserted ${result.length} documents`);

  // 7. Stats
  const byCat = await ShopMenuItemModel.aggregate([
    { $group: { _id: '$attributes.category', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  console.log('\nCategory breakdown:');
  for (const c of byCat) {
    console.log(`  ${(c._id || '(empty)').padEnd(15)} ${c.count}`);
  }

  const byShop = await ShopMenuItemModel.aggregate([
    { $group: { _id: '$shopName', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  console.log(`\nShops with data: ${byShop.length}`);

  await mongoose.disconnect();
  console.log('Done!');
}

main().catch(err => { console.error(err); process.exit(1); });
