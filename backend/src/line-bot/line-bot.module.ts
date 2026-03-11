import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LineBotController } from './line-bot.controller';
import { LineBotService } from './line-bot.service';

@Module({
  imports: [ConfigModule],
  controllers: [LineBotController],
  providers: [LineBotService],
})
export class LineBotModule {}
