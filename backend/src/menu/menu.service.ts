import { Injectable } from '@nestjs/common';
import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';

import { Menu } from './schema/menu.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

//feature
import { ControlMenuDto } from './dto/control-menu.dto';

@Injectable()
export class MenuService {
  constructor(@InjectModel(Menu.name) private menuModel: Model<Menu>) {}

  async create(createMenuDto: CreateMenuDto): Promise<Menu> {
    const createdMenu = new this.menuModel(createMenuDto);
    return createdMenu.save();
  }

  async findAll(): Promise<Menu[]> {
    return this.menuModel.find().exec();
  }

  findOne(id: number) {
    return `This action returns a #${id} menu`;
  }

  update(id: number, updateMenuDto: UpdateMenuDto) {
    return `This action updates a #${id} menu`;
  }

  remove(id: number) {
    return `This action removes a #${id} menu`;
  }

  async findByFilter(filter: ControlMenuDto): Promise<Menu[]> {
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

    interface MenuQuery {
      category?: string;
      ingredients?: { $in: string[] };
      cookingMethod?: { $in: string[] };
    }
    const query: MenuQuery = {};

    if (filter.q1) {
      query.category = filter.q1;
    }
    if (filter.q2) {
      query.ingredients = { $in: INGREDIENT_MAP[filter.q2] };
    }
    if (filter.q3) {
      query.cookingMethod = { $in: COOKING_METHOD_MAP[filter.q3] };
    }
    return this.menuModel.find(query).exec();
  }
}
