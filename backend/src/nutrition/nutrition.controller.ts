import { Controller, Get, Query } from '@nestjs/common';
import { NutritionService } from './nutrition.service';

@Controller('nutrition')
export class NutritionController {
  constructor(private readonly nutritionService: NutritionService) {}

  @Get('weekly')
  getWeeklySummary(@Query('userId') userId: string) {
    return this.nutritionService.getWeeklySummary(userId);
  }
}
