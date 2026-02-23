import { Module } from '@nestjs/common';
import { ShopMenuItemService } from './shop-menu-item.service';
import { ShopMenuItemController } from './shop-menu-item.controller';

@Module({
  controllers: [ShopMenuItemController],
  providers: [ShopMenuItemService],
})
export class ShopMenuItemModule {}
