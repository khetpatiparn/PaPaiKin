import { Module } from '@nestjs/common';
import { NutritionService } from './nutrition.service';
import { FoodDiaryModule } from 'src/food-diary/food-diary.module';
import { UserProfileModule } from 'src/user-profile/user-profile.module';

@Module({
  imports: [FoodDiaryModule, UserProfileModule],
  providers: [NutritionService],
  exports: [NutritionService],
})
export class NutritionModule {}
