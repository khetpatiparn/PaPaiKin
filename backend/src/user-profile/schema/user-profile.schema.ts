import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserProfileDocument = HydratedDocument<UserProfile>;

@Schema({ timestamps: true })
export class UserProfile {
  @Prop({ required: true, unique: true, index: true })
  declare lineUserId: string;

  @Prop({ type: String, default: '' })
  declare displayName: string;

  @Prop({ type: String, enum: ['lose', 'maintain', 'gain'], required: true })
  declare goal: string;

  @Prop({ type: String, enum: ['male', 'female'], required: true })
  declare gender: string;

  @Prop({ required: true, min: 10, max: 120 })
  declare age: number;

  @Prop({ required: true, min: 20, max: 300 })
  declare weight: number;

  @Prop({ required: true, min: 50, max: 250 })
  declare height: number;

  @Prop({
    type: String,
    enum: ['sedentary', 'light', 'moderate', 'very_active'],
    required: true,
  })
  declare activityLevel: string;

  @Prop({ type: String, default: '' })
  declare bodyFatRange: string;

  @Prop({ required: true, min: 500 })
  declare dailyCalorieGoal: number;

  @Prop({ required: true, min: 0 })
  declare dailyProteinGoal: number;

  @Prop({ required: true, min: 0 })
  declare dailyCarbGoal: number;

  @Prop({ required: true, min: 0 })
  declare dailyFatGoal: number;

  declare createdAt: Date;
  declare updatedAt: Date;
}

export const UserProfileSchema = SchemaFactory.createForClass(UserProfile);
