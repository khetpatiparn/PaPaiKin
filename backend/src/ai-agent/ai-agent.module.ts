import { Module } from '@nestjs/common';
import { AiAgentService } from './ai-agent.service';
import { NutritionModule } from 'src/nutrition/nutrition.module';
import { GooglePlacesModule } from 'src/google-places/google-places.module';

@Module({
  imports: [NutritionModule, GooglePlacesModule],
  providers: [AiAgentService],
  exports: [AiAgentService],
})
export class AiAgentModule {}
