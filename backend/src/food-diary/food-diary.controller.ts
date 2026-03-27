import { Controller, Get, Query } from '@nestjs/common';
import { FoodDiaryService } from './food-diary.service';

@Controller('history')
export class FoodDiaryController {
  constructor(private readonly foodDiaryService: FoodDiaryService) {}

  @Get('data')
  async getData(@Query('userId') userId: string) {
    return this.foodDiaryService.getAllEntries(userId);
  }
}
