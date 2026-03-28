import { Injectable } from '@nestjs/common';
import { FoodDiaryService } from 'src/food-diary/food-diary.service';
import { UserProfileService } from 'src/user-profile/user-profile.service';

export interface NutritionGap {
  hasProfile: boolean;
  calories: { goal: number; consumed: number; remaining: number };
  protein: { goal: number; consumed: number; remaining: number };
  carb: { goal: number; consumed: number; remaining: number };
  fat: { goal: number; consumed: number; remaining: number };
}

export interface WeeklySummary {
  days: {
    date: string; // 'YYYY-MM-DD'
    calories: number;
    protein: number;
    carb: number;
    fat: number;
    entryCount: number;
  }[];
  avgCalories: number;
  avgProtein: number;
  avgCarb: number;
  avgFat: number;
}

@Injectable()
export class NutritionService {
  constructor(
    private readonly foodDiaryService: FoodDiaryService,
    private readonly userProfileService: UserProfileService,
  ) {}

  async getNutritionGap(lineUserId: string): Promise<NutritionGap> {
    const [profile, todayEntries] = await Promise.all([
      this.userProfileService.findByLineUserId(lineUserId),
      this.foodDiaryService.getTodaySummary(lineUserId),
    ]);

    if (!profile) {
      return {
        hasProfile: false,
        calories: { goal: 0, consumed: 0, remaining: 0 },
        protein: { goal: 0, consumed: 0, remaining: 0 },
        carb: { goal: 0, consumed: 0, remaining: 0 },
        fat: { goal: 0, consumed: 0, remaining: 0 },
      };
    }

    const consumed = {
      calories: todayEntries.reduce((sum, e) => sum + e.calories, 0),
      protein: todayEntries.reduce((sum, e) => sum + e.protein, 0),
      carb: todayEntries.reduce((sum, e) => sum + e.carb, 0),
      fat: todayEntries.reduce((sum, e) => sum + e.fat, 0),
    };

    return {
      hasProfile: true,
      calories: {
        goal: profile.dailyCalorieGoal,
        consumed: consumed.calories,
        remaining: profile.dailyCalorieGoal - consumed.calories,
      },
      protein: {
        goal: profile.dailyProteinGoal,
        consumed: consumed.protein,
        remaining: profile.dailyProteinGoal - consumed.protein,
      },
      carb: {
        goal: profile.dailyCarbGoal,
        consumed: consumed.carb,
        remaining: profile.dailyCarbGoal - consumed.carb,
      },
      fat: {
        goal: profile.dailyFatGoal,
        consumed: consumed.fat,
        remaining: profile.dailyFatGoal - consumed.fat,
      },
    };
  }

  async getWeeklySummary(lineUserId: string): Promise<WeeklySummary> {
    const allEntries = await this.foodDiaryService.getAllEntries(lineUserId);

    // Calendar Week: จันทร์ของสัปดาห์นี้ → วันนี้
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=อาทิตย์, 1=จันทร์, ...
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(today);
    monday.setDate(today.getDate() - daysFromMonday);

    const dayMap = new Map<
      string,
      {
        calories: number;
        protein: number;
        carb: number;
        fat: number;
        entryCount: number;
      }
    >();

    for (let i = 0; i <= daysFromMonday; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      dayMap.set(key, {
        calories: 0,
        protein: 0,
        carb: 0,
        fat: 0,
        entryCount: 0,
      });
    }

    for (const entry of allEntries) {
      const key = new Date(entry.createdAt).toISOString().slice(0, 10);
      const day = dayMap.get(key);
      if (!day) continue;
      day.calories += entry.calories;
      day.protein += entry.protein;
      day.carb += entry.carb;
      day.fat += entry.fat;
      day.entryCount += 1;
    }

    const days = Array.from(dayMap.entries()).map(([date, v]) => ({
      date,
      ...v,
    }));
    const daysElapsed = daysFromMonday + 1;

    return {
      days,
      avgCalories: Math.round(
        days.reduce((s, d) => s + d.calories, 0) / daysElapsed,
      ),
      avgProtein: Math.round(
        days.reduce((s, d) => s + d.protein, 0) / daysElapsed,
      ),
      avgCarb: Math.round(days.reduce((s, d) => s + d.carb, 0) / daysElapsed),
      avgFat: Math.round(days.reduce((s, d) => s + d.fat, 0) / daysElapsed),
    };
  }
}
