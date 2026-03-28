import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
// config
import { ConfigModule, ConfigService } from '@nestjs/config';
// mongoose
import { MongooseModule } from '@nestjs/mongoose';
import { MenuModule } from './menu/menu.module';
import { ShopModule } from './shop/shop.module';
import { ShopMenuItemModule } from './shop-menu-item/shop-menu-item.module';
import { Connection } from 'mongoose';
import { LineBotModule } from './line-bot/line-bot.module';
import { FoodDiaryModule } from './food-diary/food-diary.module';
import { UserProfileModule } from './user-profile/user-profile.module';
import { NutritionModule } from './nutrition/nutrition.module';

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
    MenuModule,
    ShopModule,
    ShopMenuItemModule,
    LineBotModule,
    FoodDiaryModule,
    UserProfileModule,
    NutritionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
