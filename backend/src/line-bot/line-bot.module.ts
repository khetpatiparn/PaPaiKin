import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LineBotController } from './line-bot.controller';
import { LineBotService } from './line-bot.service';
import { ShopMenuItemModule } from 'src/shop-menu-item/shop-menu-item.module';
import { GeminiModule } from 'src/gemini/gemini.module';
import { FoodDiaryModule } from 'src/food-diary/food-diary.module';
import { UserProfileModule } from 'src/user-profile/user-profile.module';

@Module({
  imports: [ConfigModule, ShopMenuItemModule, GeminiModule, FoodDiaryModule, UserProfileModule],
  controllers: [LineBotController],
  providers: [LineBotService],
})
export class LineBotModule {}
