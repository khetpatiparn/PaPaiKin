import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserProfile, UserProfileDocument } from './schema/user-profile.schema';

export interface CreateUserProfileDto {
  lineUserId: string;
  displayName?: string;
  goal: 'lose' | 'maintain' | 'gain';
  gender: 'male' | 'female';
  age: number;
  weight: number; // kg
  height: number; // cm
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'very_active';
  bodyFatRange?: string;
}

@Injectable()
export class UserProfileService {
  constructor(
    @InjectModel(UserProfile.name)
    private userProfileModel: Model<UserProfile>,
  ) {}

  calculateTDEE(
    dto: Omit<
      CreateUserProfileDto,
      'lineUserId' | 'displayName' | 'bodyFatRange'
    >,
  ): {
    dailyCalorieGoal: number;
    dailyProteinGoal: number;
    dailyCarbGoal: number;
    dailyFatGoal: number;
  } {
    // Mifflin-St Jeor BMR
    const bmr =
      dto.gender === 'male'
        ? 10 * dto.weight + 6.25 * dto.height - 5 * dto.age + 5
        : 10 * dto.weight + 6.25 * dto.height - 5 * dto.age - 161;

    const multipliers = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      very_active: 1.725,
    };
    const tdee = bmr * multipliers[dto.activityLevel];

    const goalAdjustment = { lose: -500, maintain: 0, gain: 300 };
    const dailyCalorieGoal = Math.round(tdee + goalAdjustment[dto.goal]);

    // Macro splits (protein/carb/fat %)
    const macroSplits = {
      lose: { protein: 0.3, carb: 0.4, fat: 0.3 },
      maintain: { protein: 0.3, carb: 0.45, fat: 0.25 },
      gain: { protein: 0.35, carb: 0.45, fat: 0.2 },
    };
    const split = macroSplits[dto.goal];

    return {
      dailyCalorieGoal,
      dailyProteinGoal: Math.round((dailyCalorieGoal * split.protein) / 4), // 4 kcal/g
      dailyCarbGoal: Math.round((dailyCalorieGoal * split.carb) / 4), // 4 kcal/g
      dailyFatGoal: Math.round((dailyCalorieGoal * split.fat) / 9), // 9 kcal/g
    };
  }

  async createOrUpdate(
    dto: CreateUserProfileDto,
  ): Promise<UserProfileDocument> {
    const goals = this.calculateTDEE(dto);
    return this.userProfileModel
      .findOneAndUpdate(
        { lineUserId: dto.lineUserId },
        {
          ...dto,
          ...goals,
        },
        { upsert: true, new: true },
      )
      .exec();
  }

  async findByLineUserId(
    lineUserId: string,
  ): Promise<UserProfileDocument | null> {
    return this.userProfileModel.findOne({ lineUserId }).exec();
  }
}
