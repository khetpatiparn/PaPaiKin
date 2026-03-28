import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ShopMenuItemService } from './shop-menu-item.service';
import { ShopMenuItem } from './schema/shop-menu-item.schema';
import { ShopMenuItemDocument } from './schema/shop-menu-item.schema';

function makeMenu(
  overrides: Partial<{
    id: string;
    price: number;
    lat: number;
    lng: number;
    shopName: string;
  }> = {},
): ShopMenuItemDocument {
  return {
    _id: { toString: () => overrides.id ?? 'menu-1' },
    price: overrides.price ?? 100,
    shopName: overrides.shopName ?? 'ร้านทดสอบ',
    location: {
      type: 'Point',
      coordinates: [overrides.lng ?? 100.5, overrides.lat ?? 13.7],
    },
  } as unknown as ShopMenuItemDocument;
}

const mockShopMenuItemModel = {
  find: jest.fn(),
  findOne: jest.fn(),
};

describe('ShopMenuItemService', () => {
  let service: ShopMenuItemService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShopMenuItemService,
        {
          provide: getModelToken(ShopMenuItem.name),
          useValue: mockShopMenuItemModel,
        },
      ],
    }).compile();

    service = module.get<ShopMenuItemService>(ShopMenuItemService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateDistance', () => {
    it('returns 0 when both points are the same', () => {
      const distance = service.calculateDistance(13.7, 100.5, 13.7, 100.5);
      expect(distance).toBeCloseTo(0, 0);
    });

    it('calculates distance between Bangkok and Chiang Mai (~550 km)', () => {
      const distance = service.calculateDistance(13.75, 100.52, 18.79, 98.98);
      const distanceKm = distance / 1000;
      expect(distanceKm).toBeGreaterThan(500);
      expect(distanceKm).toBeLessThan(650);
    });
  });

  describe('findCheapestMenu', () => {
    it('returns null when given empty array', () => {
      expect(service.findCheapestMenu([])).toBeNull();
    });

    it('returns the menu with lowest price', () => {
      const menus = [
        makeMenu({ id: 'a', price: 80 }),
        makeMenu({ id: 'b', price: 50 }),
        makeMenu({ id: 'c', price: 120 }),
      ];
      const result = service.findCheapestMenu(menus);
      expect(result?._id.toString()).toBe('b');
    });

    it('returns the only item when array has one element', () => {
      const menus = [makeMenu({ id: 'only', price: 60 })];
      expect(service.findCheapestMenu(menus)?._id.toString()).toBe('only');
    });
  });

  describe('findNearestMenu', () => {
    it('returns null when given empty array', () => {
      const result = service.findNearestMenu([], {
        latitude: 13.7,
        longitude: 100.5,
      });
      expect(result).toBeNull();
    });

    it('returns the menu closest to user location', () => {
      const userLocation = { latitude: 13.7, longitude: 100.5 };
      const menus = [
        makeMenu({ id: 'far', lat: 18.8, lng: 99.0 }),
        makeMenu({ id: 'near', lat: 13.71, lng: 100.51 }),
        makeMenu({ id: 'mid', lat: 14.0, lng: 100.6 }),
      ];
      const result = service.findNearestMenu(menus, userLocation);
      expect(result?._id.toString()).toBe('near');
    });
  });

  describe('findRandomMenu', () => {
    it('returns null when all menus are excluded', () => {
      const menu = makeMenu({ id: 'x' });
      const result = service.findRandomMenu([menu], [menu]);
      expect(result).toBeNull();
    });

    it('returns null when given empty array', () => {
      expect(service.findRandomMenu([], [])).toBeNull();
    });

    it('never returns an excluded menu', () => {
      const excluded = makeMenu({ id: 'excluded' });
      const allowed = makeMenu({ id: 'allowed' });
      for (let i = 0; i < 10; i++) {
        const result = service.findRandomMenu([excluded, allowed], [excluded]);
        expect(result?._id.toString()).toBe('allowed');
      }
    });

    it('returns one of the non-excluded menus', () => {
      const a = makeMenu({ id: 'a' });
      const b = makeMenu({ id: 'b' });
      const c = makeMenu({ id: 'c' });
      const result = service.findRandomMenu([a, b, c], [a]);
      expect(['b', 'c']).toContain(result?._id.toString());
    });
  });

  describe('getGuidedMenu', () => {
    const userLocation = { latitude: 13.7, longitude: 100.5 };
    const filter = {
      userAnswer: { q1: 'SINGLE_DISH', q2: 'PORK', q3: 'DRY' },
      userLocation,
    };

    it('returns cheapestMenu with lowest price', async () => {
      mockShopMenuItemModel.find.mockReturnValue({
        exec: jest
          .fn()
          .mockResolvedValue([
            makeMenu({ id: 'cheap', price: 40, lat: 13.8, lng: 100.6 }),
            makeMenu({ id: 'mid', price: 80, lat: 13.72, lng: 100.52 }),
            makeMenu({ id: 'exp', price: 150, lat: 18.8, lng: 99.0 }),
          ]),
      });

      const result = await service.getGuidedMenu(filter);
      expect(result.cheapestMenu?._id.toString()).toBe('cheap');
    });

    it('nearestMenu is not the same as cheapestMenu', async () => {
      mockShopMenuItemModel.find.mockReturnValue({
        exec: jest
          .fn()
          .mockResolvedValue([
            makeMenu({ id: 'cheap', price: 40, lat: 18.8, lng: 99.0 }),
            makeMenu({ id: 'near', price: 80, lat: 13.71, lng: 100.51 }),
            makeMenu({ id: 'other', price: 120, lat: 14.0, lng: 100.6 }),
          ]),
      });

      const result = await service.getGuidedMenu(filter);
      expect(result.cheapestMenu?._id.toString()).toBe('cheap');
      expect(result.nearestMenu?._id.toString()).toBe('near');
      expect(result.cheapestMenu?._id.toString()).not.toBe(
        result.nearestMenu?._id.toString(),
      );
    });

    it('randomMenu is different from cheapest and nearest', async () => {
      mockShopMenuItemModel.find.mockReturnValue({
        exec: jest
          .fn()
          .mockResolvedValue([
            makeMenu({ id: 'cheap', price: 40, lat: 18.8, lng: 99.0 }),
            makeMenu({ id: 'near', price: 80, lat: 13.71, lng: 100.51 }),
            makeMenu({ id: 'rand', price: 100, lat: 14.0, lng: 100.6 }),
          ]),
      });

      const result = await service.getGuidedMenu(filter);
      const ids = [
        result.cheapestMenu?._id.toString(),
        result.nearestMenu?._id.toString(),
      ];
      expect(ids).not.toContain(result.randomMenu?._id.toString());
    });

    it('returns null for all when DB is empty', async () => {
      mockShopMenuItemModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      });

      const result = await service.getGuidedMenu(filter);
      expect(result.cheapestMenu).toBeNull();
      expect(result.nearestMenu).toBeNull();
      expect(result.randomMenu).toBeNull();
    });
  });
});
