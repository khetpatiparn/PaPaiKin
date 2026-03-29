import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LineBotController } from './line-bot.controller';
import { LineBotService } from './line-bot.service';
import { GeminiModule } from 'src/gemini/gemini.module';
import { FoodDiaryModule } from 'src/food-diary/food-diary.module';
import { UserProfileModule } from 'src/user-profile/user-profile.module';
import { AiAgentModule } from 'src/ai-agent/ai-agent.module';

@Module({
  imports: [
    ConfigModule,
    GeminiModule,
    FoodDiaryModule,
    UserProfileModule,
    AiAgentModule,
  ],
  controllers: [LineBotController],
  providers: [LineBotService],
})
export class LineBotModule {}
