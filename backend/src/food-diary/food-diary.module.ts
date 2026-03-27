import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FoodDiary, FoodDiarySchema } from './schema/food-diary.schema';
import { FoodDiaryService } from './food-diary.service';
import { FoodDiaryController } from './food-diary.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FoodDiary.name, schema: FoodDiarySchema },
    ]),
  ],
  controllers: [FoodDiaryController],
  providers: [FoodDiaryService],
  exports: [FoodDiaryService],
})
export class FoodDiaryModule {}
