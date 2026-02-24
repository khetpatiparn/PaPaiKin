import { Injectable } from '@nestjs/common';
import { CreateShopMenuItemDto } from './dto/create-shop-menu-item.dto';
import { UpdateShopMenuItemDto } from './dto/update-shop-menu-item.dto';

import { ShopMenuItem } from './schema/shop-menu-item.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class ShopMenuItemService {
  constructor(
    @InjectModel(ShopMenuItem.name) private menuModel: Model<ShopMenuItem>,
  ) {}

  create(createShopMenuItemDto: CreateShopMenuItemDto) {
    return 'This action adds a new shopMenuItem';
  }

  findAll() {
    return `This action returns all shopMenuItem`;
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
}
