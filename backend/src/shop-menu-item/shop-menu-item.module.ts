import { Module } from '@nestjs/common';
import { ShopMenuItemService } from './shop-menu-item.service';
import { ShopMenuItemController } from './shop-menu-item.controller';

import { MongooseModule } from '@nestjs/mongoose';
import {
  ShopMenuItem,
  ShopMenuItemSchema,
} from './schema/shop-menu-item.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ShopMenuItem.name, schema: ShopMenuItemSchema },
    ]),
  ],
  controllers: [ShopMenuItemController],
  providers: [ShopMenuItemService],
})
export class ShopMenuItemModule {}
