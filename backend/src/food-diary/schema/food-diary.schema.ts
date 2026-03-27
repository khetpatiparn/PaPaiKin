import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type FoodDiaryDocument = HydratedDocument<FoodDiary>;

@Schema({ timestamps: true })
export class FoodDiary {
  @Prop({ required: true, index: true })
  declare lineUserId: string;

  @Prop({ required: true })
  declare menuName: string;

  @Prop({ required: true })
  declare calories: number;

  @Prop({ required: true })
  declare protein: number;

  @Prop({ required: true })
  declare carb: number;

  @Prop({ required: true })
  declare fat: number;

  declare createdAt: Date;
}

export const FoodDiarySchema = SchemaFactory.createForClass(FoodDiary);
