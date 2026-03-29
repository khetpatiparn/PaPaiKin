import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
// config
import { ConfigModule, ConfigService } from '@nestjs/config';
// mongoose
import { MongooseModule } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { LineBotModule } from './line-bot/line-bot.module';
import { FoodDiaryModule } from './food-diary/food-diary.module';
import { UserProfileModule } from './user-profile/user-profile.module';
import { NutritionModule } from './nutrition/nutrition.module';
import { GooglePlacesModule } from './google-places/google-places.module';
import { AiAgentModule } from './ai-agent/ai-agent.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => ({
        uri: config.get<string>('DB_URI'), // Loaded from .ENV
        onConnectionCreate: (connection: Connection) => {
          connection.on('connected', () => console.log('connected'));
          connection.on('open', () => console.log('open'));
          connection.on('disconnected', () => console.log('disconnected'));
          connection.on('reconnected', () => console.log('reconnected'));
          connection.on('disconnecting', () => console.log('disconnecting'));
        },
      }),
    }),
    LineBotModule,
    FoodDiaryModule,
    UserProfileModule,
    NutritionModule,
    GooglePlacesModule,
    AiAgentModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
