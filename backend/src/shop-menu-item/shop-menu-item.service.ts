import { Injectable } from '@nestjs/common';
import { CreateShopMenuItemDto } from './dto/create-shop-menu-item.dto';
// import { UpdateShopMenuItemDto } from './dto/update-shop-menu-item.dto';

import {
  ShopMenuItem,
  ShopMenuItemDocument,
} from './schema/shop-menu-item.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

// feauture
// import { ControlMenuDto } from './dto/control-menu.dto';
import { GuidedMenuDto, UserLocationDto } from './dto/guided-menu.dto';
import { RestaurantListingDto } from './dto/restaurant-listing.dto';

@Injectable()
export class ShopMenuItemService {
  constructor(
    @InjectModel(ShopMenuItem.name)
    private shopMenuItemModel: Model<ShopMenuItem>,
  ) {}

  async create(
    createShopMenuItemDto: CreateShopMenuItemDto,
  ): Promise<ShopMenuItem> {
    const createShopMenuItem = new this.shopMenuItemModel(
      createShopMenuItemDto,
    );
    return createShopMenuItem.save();
  }

  async findAll(): Promise<ShopMenuItem[]> {
    return this.shopMenuItemModel.find().exec();
  }

  findOne(id: number) {
    return `This action returns a #${id} shopMenuItem`;
  }

  // update(id: number, updateShopMenuItemDto: UpdateShopMenuItemDto) {
  //   return `This action updates a #${id} shopMenuItem`;
  // }

  remove(id: number) {
    return `This action removes a #${id} shopMenuItem`;
  }

  // GUIDED MENU FEATURES
  // {"userAnswer": {"q1": "SINGLE_DISH", "q2": "PORK", "q3": "DRY"}, "userLocation": {"latitude": 13.7259477, "longitude": 100.7707321}}
  async findMenuQuery(filter: GuidedMenuDto): Promise<ShopMenuItemDocument[]> {
    const INGREDIENT_MAP: Record<string, string[]> = {
      PORK: ['หมู', 'หมูสับ', 'หมูกรอบ', 'หมูแดง', 'เนื้อหมู'],
      CHICKEN: ['ไก่', 'อกไก่', 'สะโพกไก่', 'ปีกไก่', 'ไก่ต้ม'],
      BEEF: ['เนื้อ', 'เนื้อวัว'],
      SEAFOOD: ['กุ้ง', 'ปลา', 'ปลาหมึก', 'หอย', 'ปู'],
      VEGETARIAN: ['ผัก', 'เต้าหู้', 'เห็ด'],
    };
    const COOKING_METHOD_MAP: Record<string, string[]> = {
      DRY: ['แห้ง', 'ผัด', 'ทอด', 'ย่าง', 'ยำ'],
      SOUP: ['น้ำ', 'แกง', 'ต้ม', 'ซุป'],
    };

    interface shopMenuItemQuery {
      'attributes.category': string;
      'attributes.ingredients'?: { $in: string[] };
      'attributes.cookingMethod'?: { $in: string[] };
    }

    const query: shopMenuItemQuery = {
      'attributes.category': filter.userAnswer.q1,
    };

    if (filter.userAnswer.q2) {
      query['attributes.ingredients'] = {
        $in: INGREDIENT_MAP[filter.userAnswer.q2],
      };
    }
    if (filter.userAnswer.q3) {
      query['attributes.cookingMethod'] = {
        $in: COOKING_METHOD_MAP[filter.userAnswer.q3],
      };
    }
    return this.shopMenuItemModel.find(query).exec();
  }

  findCheapestMenu(menus: ShopMenuItemDocument[]): ShopMenuItemDocument | null {
    if (menus.length === 0) return null;
    return menus.reduce((cheapest, current) =>
      current.price < cheapest.price ? current : cheapest,
    );
  }

  findNearestMenu(
    menus: ShopMenuItemDocument[],
    userLocation: UserLocationDto,
  ): ShopMenuItemDocument | null {
    if (menus.length === 0) return null;
    let nearest = menus[0];
    let minDistance = this.calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      nearest.location.coordinates[1],
      nearest.location.coordinates[0],
    );
    for (const menu of menus) {
      const distance = this.calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        menu.location.coordinates[1], // latitude อยู่ index 1
        menu.location.coordinates[0], // longitude อยู่ index 0
      );
      if (distance < minDistance) {
        minDistance = distance;
        nearest = menu;
      }
    }
    return nearest;
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

  findRandomMenu(
    menus: ShopMenuItemDocument[],
    exclude: (ShopMenuItemDocument | null)[],
  ) {
    const excludeIds = exclude
      .filter((m): m is ShopMenuItemDocument => m !== null)
      .map((m) => m._id.toString());

    const remaining = menus.filter(
      (m) => !excludeIds.includes(m._id.toString()),
    );

    if (remaining.length === 0) return null;

    const randomIdx = Math.floor(Math.random() * remaining.length);
    return remaining[randomIdx];
  }

  async getGuidedMenu(filter: GuidedMenuDto) {
    const allMenus = await this.findMenuQuery(filter);

    const cheapest = this.findCheapestMenu(allMenus);

    const nearest = this.findNearestMenu(
      allMenus.filter((m) => m._id.toString() !== cheapest?._id.toString()),
      filter.userLocation,
    );

    const random = this.findRandomMenu(allMenus, [cheapest, nearest]);

    const cards = [cheapest, nearest, random];
    const distanceCards = cards.map((card) =>
      card
        ? this.calculateDistance(
            filter.userLocation.latitude,
            filter.userLocation.longitude,
            card.location.coordinates[1],
            card.location.coordinates[0],
          )
        : null,
    );

    return {
      randomMenu: random,
      cheapestMenu: cheapest,
      nearestMenu: nearest,
      distanceCards: distanceCards,
    };
  }

  async findRestaurantByMenu(
    dto: RestaurantListingDto,
  ): Promise<ShopMenuItemDocument[]> {
    const query = { menuId: dto.menuId };
    return this.shopMenuItemModel.find(query).exec();
  }
}
