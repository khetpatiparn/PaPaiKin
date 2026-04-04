import { Module } from '@nestjs/common';
import { AiAgentService } from './ai-agent.service';
import { NutritionModule } from 'src/nutrition/nutrition.module';
import { GooglePlacesModule } from 'src/google-places/google-places.module';
import { FoodDiaryModule } from 'src/food-diary/food-diary.module';
import { UserProfileModule } from 'src/user-profile/user-profile.module';

@Module({
  imports: [
    NutritionModule,
    GooglePlacesModule,
    FoodDiaryModule,
    UserProfileModule,
  ],
  providers: [AiAgentService],
  exports: [AiAgentService],
})
export class AiAgentModule {}
