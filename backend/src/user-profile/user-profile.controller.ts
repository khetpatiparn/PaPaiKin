import { Controller, Get, Put, Query, Body } from '@nestjs/common';
import { UserProfileService } from './user-profile.service';

interface UpdateProfileDto {
  goal: 'lose' | 'maintain' | 'gain';
  gender: 'male' | 'female';
  age: number;
  weight: number;
  height: number;
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'very_active';
  bodyFatRange?: string;
}

@Controller('user-profile')
export class UserProfileController {
  constructor(private readonly userProfileService: UserProfileService) {}

  @Get()
  async getProfile(@Query('userId') userId: string) {
    return this.userProfileService.findByLineUserId(userId);
  }

  @Put()
  async updateProfile(
    @Query('userId') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    const current = await this.userProfileService.findByLineUserId(userId);
    if (!current) return null;

    return this.userProfileService.createOrUpdate({
      lineUserId: userId,
      goal: dto.goal,
      gender: dto.gender,
      age: dto.age,
      weight: dto.weight,
      height: dto.height,
      activityLevel: dto.activityLevel,
      bodyFatRange: dto.bodyFatRange ?? current.bodyFatRange,
    });
  }
}
