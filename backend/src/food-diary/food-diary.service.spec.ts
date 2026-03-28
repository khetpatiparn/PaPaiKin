import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { FoodDiaryService } from './food-diary.service';
import { FoodDiary, FoodDiaryDocument } from './schema/food-diary.schema';

// ─── Helper: สร้าง fake food diary entry ────────────────────────────────────
function makeEntry(
  overrides: Partial<{
    lineUserId: string;
    menuName: string;
    calories: number;
    createdAt: Date;
  }> = {},
): FoodDiaryDocument {
  return {
    lineUserId: overrides.lineUserId ?? 'user-1',
    menuName: overrides.menuName ?? 'ข้าวผัด',
    calories: overrides.calories ?? 300,
    createdAt: overrides.createdAt ?? new Date(),
  } as unknown as FoodDiaryDocument;
}

// ─── Mock Model ──────────────────────────────────────────────────────────────
// getTodaySummary เรียก .find().sort().exec()
// ต้อง mock เป็น chain: find → sort → exec
const mockFoodDiaryModel = {
  find: jest.fn(),
};

describe('FoodDiaryService', () => {
  let service: FoodDiaryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FoodDiaryService,
        {
          provide: getModelToken(FoodDiary.name),
          useValue: mockFoodDiaryModel,
        },
      ],
    }).compile();

    service = module.get<FoodDiaryService>(FoodDiaryService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── getTodaySummary ───────────────────────────────────────────────────────
  describe('getTodaySummary', () => {
    // helper: mock chain find().sort().exec() ให้คืน data ที่กำหนด
    function mockFind(data: FoodDiaryDocument[]) {
      mockFoodDiaryModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(data),
        }),
      });
    }

    it('returns entries for the correct user', async () => {
      const entries = [
        makeEntry({ lineUserId: 'user-1', menuName: 'ข้าวผัด' }),
        makeEntry({ lineUserId: 'user-1', menuName: 'ต้มยำ' }),
      ];
      mockFind(entries);

      const result = await service.getTodaySummary('user-1');
      expect(result).toHaveLength(2);
    });

    it('returns empty array when no entries today', async () => {
      mockFind([]);

      const result = await service.getTodaySummary('user-1');
      expect(result).toHaveLength(0);
    });

    it('queries with correct userId', async () => {
      mockFind([]);

      await service.getTodaySummary('user-abc');

      // ตรวจว่า find() ถูกเรียกด้วย lineUserId ที่ถูกต้อง
      expect(mockFoodDiaryModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ lineUserId: 'user-abc' }),
      );
    });

    it('queries with today date range', async () => {
      mockFind([]);

      await service.getTodaySummary('user-1');

      const callArg = mockFoodDiaryModel.find.mock.calls[0][0];

      // ตรวจว่า query มี createdAt ที่มี $gte และ $lte
      expect(callArg.createdAt).toHaveProperty('$gte');
      expect(callArg.createdAt).toHaveProperty('$lte');

      // $gte ต้องเป็นเวลา 00:00 ของวันนี้
      const gte: Date = callArg.createdAt.$gte;
      expect(gte.getHours()).toBe(0);
      expect(gte.getMinutes()).toBe(0);

      // $lte ต้องเป็นเวลา 23:59 ของวันนี้
      const lte: Date = callArg.createdAt.$lte;
      expect(lte.getHours()).toBe(23);
      expect(lte.getMinutes()).toBe(59);
    });
  });

  // ─── getAllEntries ─────────────────────────────────────────────────────────
  describe('getAllEntries', () => {
    it('returns all entries for user', async () => {
      const entries = [
        makeEntry({ menuName: 'ข้าวผัด' }),
        makeEntry({ menuName: 'ผัดกะเพรา' }),
        makeEntry({ menuName: 'ต้มยำ' }),
      ];
      mockFoodDiaryModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(entries),
        }),
      });

      const result = await service.getAllEntries('user-1');
      expect(result).toHaveLength(3);
    });

    it('queries with correct userId', async () => {
      mockFoodDiaryModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
      });

      await service.getAllEntries('user-xyz');

      expect(mockFoodDiaryModel.find).toHaveBeenCalledWith({ lineUserId: 'user-xyz' });
    });
  });
});
