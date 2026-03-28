import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FoodDiary, FoodDiaryDocument } from './schema/food-diary.schema';

@Injectable()
export class FoodDiaryService {
  constructor(
    @InjectModel(FoodDiary.name)
    private foodDiaryModel: Model<FoodDiary>,
  ) {}

  getMealTypeFromTime(date: Date = new Date()): string {
    const hour = date.getHours();
    const minute = date.getMinutes();
    const time = hour * 60 + minute;

    if (time >= 360 && time < 630) return 'breakfast'; // 06:00 - 10:30
    if (time >= 630 && time < 870) return 'lunch'; // 10:30 - 14:30
    if (time >= 870 && time < 1020) return 'snack'; // 14:30 - 17:00
    if (time >= 1020 && time < 1260) return 'dinner'; // 17:00 - 21:00
    return 'snack'; // 21:00 - 06:00
  }

  async save(
    lineUserId: string,
    menuName: string,
    calories: number,
    protein: number,
    carb: number,
    fat: number,
    cuisineType: string = '',
    confidence: number = 0,
    mealType?: string,
  ): Promise<FoodDiaryDocument> {
    const entry = new this.foodDiaryModel({
      lineUserId,
      menuName,
      calories,
      protein,
      carb,
      fat,
      mealType: mealType ?? this.getMealTypeFromTime(),
      cuisineType,
      confidence,
    });
    return entry.save();
  }

  async updateMealType(
    entryId: string,
    mealType: string,
  ): Promise<FoodDiaryDocument | null> {
    return this.foodDiaryModel
      .findByIdAndUpdate(entryId, { mealType }, { new: true })
      .exec();
  }

  async getAllEntries(lineUserId: string): Promise<FoodDiaryDocument[]> {
    return this.foodDiaryModel
      .find({ lineUserId })
      .sort({ createdAt: 1 })
      .exec();
  }

  async getTodaySummary(lineUserId: string): Promise<FoodDiaryDocument[]> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    return this.foodDiaryModel
      .find({
        lineUserId,
        createdAt: { $gte: startOfDay, $lte: endOfDay },
      })
      .sort({ createdAt: 1 })
      .exec();
  }
}
