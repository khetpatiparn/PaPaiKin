import { Injectable } from '@nestjs/common';
import { CreateShopMenuItemDto } from './dto/create-shop-menu-item.dto';
import { UpdateShopMenuItemDto } from './dto/update-shop-menu-item.dto';

import { ShopMenuItem } from './schema/shop-menu-item.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

// feauture
import { ControlMenuDto } from './dto/control-menu.dto';

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

  update(id: number, updateShopMenuItemDto: UpdateShopMenuItemDto) {
    return `This action updates a #${id} shopMenuItem`;
  }

  remove(id: number) {
    return `This action removes a #${id} shopMenuItem`;
  }

  async findByFilter(filter: ControlMenuDto): Promise<ShopMenuItem[]> {
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
      category?: string;
      ingredients?: { $in: string[] };
      cookingMethod?: { $in: string[] };
    }

    const query: shopMenuItemQuery = {};

    if (filter.q1) {
      query['attributes.category'] = filter.q1;
    }
    if (filter.q2) {
      query['attributes.ingredients'] = { $in: INGREDIENT_MAP[filter.q2] };
    }
    if (filter.q3) {
      query['attributes.cookingMethod'] = {
        $in: COOKING_METHOD_MAP[filter.q3],
      };
    }
    return this.shopMenuItemModel.find(query).exec();
  }
}
