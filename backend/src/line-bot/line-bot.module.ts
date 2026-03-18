import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LineBotController } from './line-bot.controller';
import { LineBotService } from './line-bot.service';
import { ShopMenuItemModule } from 'src/shop-menu-item/shop-menu-item.module';

@Module({
  imports: [ConfigModule, ShopMenuItemModule],
  controllers: [LineBotController],
  providers: [LineBotService],
})
export class LineBotModule {}
