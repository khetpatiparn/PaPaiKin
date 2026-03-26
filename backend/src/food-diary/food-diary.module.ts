import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FoodDiary, FoodDiarySchema } from './schema/food-diary.schema';
import { FoodDiaryService } from './food-diary.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FoodDiary.name, schema: FoodDiarySchema },
    ]),
  ],
  providers: [FoodDiaryService],
  exports: [FoodDiaryService],
})
export class FoodDiaryModule {}
