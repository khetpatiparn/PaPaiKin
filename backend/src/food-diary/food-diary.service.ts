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

  async save(
    lineUserId: string,
    menuName: string,
    calories: number,
    protein: number,
    carb: number,
    fat: number,
  ): Promise<FoodDiaryDocument> {
    const entry = new this.foodDiaryModel({
      lineUserId,
      menuName,
      calories,
      protein,
      carb,
      fat,
    });
    return entry.save();
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
